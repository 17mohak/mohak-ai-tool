"""
Slot Manipulation API
======================
Drag-and-drop support for timetable editing.

Provides endpoints for swapping and moving schedule slots with full
constraint validation (pinned slots, teacher conflicts, room conflicts,
batch conflicts, and lab synchronization).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.database import get_db
from app.models.timetable import (
    Batch,
    DayOfWeek,
    PinnedSlot,
    ScheduleSlot,
)

router = APIRouter(prefix="/slots", tags=["slot-manipulation"])


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Pydantic Schemas
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class SlotSwapIn(BaseModel):
    slot_a_id: int
    slot_b_id: int


class SlotMoveIn(BaseModel):
    slot_id: int
    target_day: str
    target_slot_index: int


class ConflictCheckResult(BaseModel):
    valid: bool
    conflicts: list[str] = []


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Helper Functions
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


async def _get_slot_with_relations(
    db: AsyncSession, slot_id: int
) -> ScheduleSlot | None:
    """Fetch a slot with all related data."""
    result = await db.execute(
        select(ScheduleSlot)
        .options(
            joinedload(ScheduleSlot.subject),
            joinedload(ScheduleSlot.teacher),
            joinedload(ScheduleSlot.room),
            joinedload(ScheduleSlot.batch),
        )
        .where(ScheduleSlot.id == slot_id)
    )
    return result.scalar_one_or_none()


async def _is_slot_pinned(db: AsyncSession, slot: ScheduleSlot) -> bool:
    """Check if a slot is pinned."""
    result = await db.execute(
        select(PinnedSlot).where(
            PinnedSlot.subject_id == slot.subject_id,
            PinnedSlot.day == slot.day,
            PinnedSlot.slot_index == slot.slot_index,
        )
    )
    return result.scalar_one_or_none() is not None


async def _check_teacher_conflict(
    db: AsyncSession,
    run_id: int,
    teacher_id: int,
    day: DayOfWeek,
    slot_index: int,
    exclude_slot_id: int | None = None,
) -> str | None:
    """Check if teacher is already teaching at this time slot."""
    q = select(ScheduleSlot).where(
        ScheduleSlot.run_id == run_id,
        ScheduleSlot.teacher_id == teacher_id,
        ScheduleSlot.day == day,
        ScheduleSlot.slot_index == slot_index,
    )
    if exclude_slot_id is not None:
        q = q.where(ScheduleSlot.id != exclude_slot_id)

    result = await db.execute(q)
    existing = result.scalar_one_or_none()
    if existing:
        return f"Teacher conflict: already teaching at {day.value} slot {slot_index}"
    return None


async def _check_room_conflict(
    db: AsyncSession,
    run_id: int,
    room_id: int,
    day: DayOfWeek,
    slot_index: int,
    exclude_slot_id: int | None = None,
) -> str | None:
    """Check if room is already occupied at this time slot."""
    q = select(ScheduleSlot).where(
        ScheduleSlot.run_id == run_id,
        ScheduleSlot.room_id == room_id,
        ScheduleSlot.day == day,
        ScheduleSlot.slot_index == slot_index,
    )
    if exclude_slot_id is not None:
        q = q.where(ScheduleSlot.id != exclude_slot_id)

    result = await db.execute(q)
    existing = result.scalar_one_or_none()
    if existing:
        return f"Room conflict: room already occupied at {day.value} slot {slot_index}"
    return None


async def _check_batch_conflict(
    db: AsyncSession,
    run_id: int,
    batch_id: int,
    day: DayOfWeek,
    slot_index: int,
    exclude_slot_id: int | None = None,
) -> str | None:
    """Check if batch already has a class at this time slot."""
    q = select(ScheduleSlot).where(
        ScheduleSlot.run_id == run_id,
        ScheduleSlot.batch_id == batch_id,
        ScheduleSlot.day == day,
        ScheduleSlot.slot_index == slot_index,
    )
    if exclude_slot_id is not None:
        q = q.where(ScheduleSlot.id != exclude_slot_id)

    result = await db.execute(q)
    existing = result.scalar_one_or_none()
    if existing:
        return (
            f"Batch conflict: batch already has class at {day.value} slot {slot_index}"
        )
    return None


async def _get_lab_group_slots(
    db: AsyncSession, run_id: int, parent_batch_id: int, day: DayOfWeek, slot_index: int
) -> list[ScheduleSlot]:
    """Get all lab slots for a parent batch at a specific time (lab synchronization)."""
    # Find all child (lab) batches
    lab_batches_result = await db.execute(
        select(Batch).where(Batch.parent_batch_id == parent_batch_id)
    )
    lab_batches = lab_batches_result.scalars().all()
    lab_batch_ids = [b.id for b in lab_batches]

    if not lab_batch_ids:
        return []

    # Find slots for these lab batches at the specified time
    slots_result = await db.execute(
        select(ScheduleSlot)
        .options(
            joinedload(ScheduleSlot.subject),
            joinedload(ScheduleSlot.teacher),
            joinedload(ScheduleSlot.room),
            joinedload(ScheduleSlot.batch),
        )
        .where(
            ScheduleSlot.run_id == run_id,
            ScheduleSlot.batch_id.in_(lab_batch_ids),
            ScheduleSlot.day == day,
            ScheduleSlot.slot_index == slot_index,
        )
    )
    return list(slots_result.scalars().all())


async def _check_lab_synchronization(
    db: AsyncSession,
    run_id: int,
    slot: ScheduleSlot,
    target_day: DayOfWeek,
    target_slot_index: int,
    exclude_slot_id: int | None = None,
) -> str | None:
    """
    Check lab synchronization rules.

    Lab batches (child batches) should generally stay synchronized with their parent.
    If moving a parent batch slot, all linked lab slots should move together.
    If moving a lab batch slot alone, it's allowed but warned.
    """
    batch = slot.batch

    # If this is a lab batch (has parent), check if it has siblings at the same time
    if batch.parent_batch_id is not None:
        # This is a lab batch - get siblings
        sibling_slots = await _get_lab_group_slots(
            db, run_id, batch.parent_batch_id, slot.day, slot.slot_index
        )

        # Check if siblings exist at the target time (they should move together)
        target_sibling_slots = await _get_lab_group_slots(
            db, run_id, batch.parent_batch_id, target_day, target_slot_index
        )

        # If there are other siblings at the original time but not at target, warn
        other_siblings_at_source = [s for s in sibling_slots if s.id != slot.id]
        if other_siblings_at_source and not target_sibling_slots:
            return (
                f"Lab synchronization warning: other lab sections still at "
                f"{slot.day.value} slot {slot.slot_index}. "
                f"Consider moving all lab sections together."
            )

    # If this is a parent batch, check for linked lab slots
    lab_slots_at_source = await _get_lab_group_slots(
        db, run_id, batch.id, slot.day, slot.slot_index
    )

    if lab_slots_at_source:
        # Check if lab slots can move to target
        for lab_slot in lab_slots_at_source:
            # Check conflicts for each lab slot
            lab_conflict = await _check_teacher_conflict(
                db,
                run_id,
                lab_slot.teacher_id,
                target_day,
                target_slot_index,
                exclude_slot_id,
            )
            if lab_conflict:
                return f"Lab synchronization conflict: {lab_conflict}"

            lab_conflict = await _check_room_conflict(
                db,
                run_id,
                lab_slot.room_id,
                target_day,
                target_slot_index,
                exclude_slot_id,
            )
            if lab_conflict:
                return f"Lab synchronization conflict: {lab_conflict}"

            lab_conflict = await _check_batch_conflict(
                db,
                run_id,
                lab_slot.batch_id,
                target_day,
                target_slot_index,
                exclude_slot_id,
            )
            if lab_conflict:
                return f"Lab synchronization conflict: {lab_conflict}"

    return None


async def _validate_slot_move(
    db: AsyncSession,
    slot: ScheduleSlot,
    target_day: DayOfWeek,
    target_slot_index: int,
    exclude_slot_id: int | None = None,
    check_lab_sync: bool = True,
) -> list[str]:
    """
    Validate a slot move operation.

    Returns list of conflict messages. Empty list means valid.
    """
    conflicts = []

    # Check if slot is pinned
    is_pinned = await _is_slot_pinned(db, slot)
    if is_pinned:
        conflicts.append(f"Slot {slot.id} is pinned and cannot be moved")
        return conflicts

    run_id = slot.run_id

    # Check teacher conflict
    teacher_conflict = await _check_teacher_conflict(
        db, run_id, slot.teacher_id, target_day, target_slot_index, exclude_slot_id
    )
    if teacher_conflict:
        conflicts.append(teacher_conflict)

    # Check room conflict
    room_conflict = await _check_room_conflict(
        db, run_id, slot.room_id, target_day, target_slot_index, exclude_slot_id
    )
    if room_conflict:
        conflicts.append(room_conflict)

    # Check batch conflict
    batch_conflict = await _check_batch_conflict(
        db, run_id, slot.batch_id, target_day, target_slot_index, exclude_slot_id
    )
    if batch_conflict:
        conflicts.append(batch_conflict)

    # Check lab synchronization
    if check_lab_sync:
        lab_conflict = await _check_lab_synchronization(
            db, run_id, slot, target_day, target_slot_index, exclude_slot_id
        )
        if lab_conflict:
            conflicts.append(lab_conflict)

    return conflicts


def _serialize_slot(slot: ScheduleSlot) -> dict:
    """Convert slot to dict for response."""
    return {
        "id": slot.id,
        "day": slot.day.value,
        "slot_index": slot.slot_index,
        "subject": slot.subject.name if slot.subject else "",
        "subject_id": slot.subject_id,
        "teacher": slot.teacher.name if slot.teacher else "",
        "teacher_id": slot.teacher_id,
        "room": slot.room.name if slot.room else "",
        "room_id": slot.room_id,
        "batch": slot.batch.name if slot.batch else "",
        "batch_id": slot.batch_id,
        "is_lab": slot.batch.parent_batch_id is not None if slot.batch else False,
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# API Endpoints
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


@router.post("/swap")
async def swap_slots(body: SlotSwapIn, db: AsyncSession = Depends(get_db)):
    """
    Swap two slots in the timetable.

    Validates:
    - Neither slot is pinned
    - No teacher conflicts created
    - No room conflicts created
    - No batch conflicts created
    - Lab synchronization maintained

    Returns updated slots.
    """
    # Fetch both slots with relations
    slot_a = await _get_slot_with_relations(db, body.slot_a_id)
    slot_b = await _get_slot_with_relations(db, body.slot_b_id)

    if not slot_a:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Slot {body.slot_a_id} not found",
        )
    if not slot_b:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Slot {body.slot_b_id} not found",
        )

    # Ensure slots are in the same run
    if slot_a.run_id != slot_b.run_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot swap slots from different timetable runs",
        )

    # Validate slot A moving to slot B's position
    conflicts_a = await _validate_slot_move(
        db, slot_a, slot_b.day, slot_b.slot_index, exclude_slot_id=slot_b.id
    )

    # Validate slot B moving to slot A's position
    conflicts_b = await _validate_slot_move(
        db, slot_b, slot_a.day, slot_a.slot_index, exclude_slot_id=slot_a.id
    )

    all_conflicts = conflicts_a + conflicts_b
    if all_conflicts:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "Swap would create conflicts",
                "conflicts": all_conflicts,
            },
        )

    # Handle lab synchronization for parent batch slots
    # If swapping a parent batch slot that has lab children, swap the labs too
    lab_slots_a = await _get_lab_group_slots(
        db, slot_a.run_id, slot_a.batch_id, slot_a.day, slot_a.slot_index
    )
    lab_slots_b = await _get_lab_group_slots(
        db, slot_b.run_id, slot_b.batch_id, slot_b.day, slot_b.slot_index
    )

    # Perform the swap
    slot_a.day, slot_b.day = slot_b.day, slot_a.day
    slot_a.slot_index, slot_b.slot_index = slot_b.slot_index, slot_a.slot_index

    # Swap lab slots if they exist
    for lab_a in lab_slots_a:
        lab_a.day = slot_a.day
        lab_a.slot_index = slot_a.slot_index

    for lab_b in lab_slots_b:
        lab_b.day = slot_b.day
        lab_b.slot_index = slot_b.slot_index

    await db.flush()

    # Reload slots with fresh data
    updated_slot_a = await _get_slot_with_relations(db, slot_a.id)
    updated_slot_b = await _get_slot_with_relations(db, slot_b.id)

    return {
        "message": "Slots swapped successfully",
        "slots": [
            _serialize_slot(updated_slot_a),
            _serialize_slot(updated_slot_b),
        ],
        "lab_slots_updated": len(lab_slots_a) + len(lab_slots_b),
    }


@router.post("/move")
async def move_slot(body: SlotMoveIn, db: AsyncSession = Depends(get_db)):
    """
    Move a slot to a new day/slot position.

    Validates:
    - Slot is not pinned
    - No teacher conflicts created
    - No room conflicts created
    - No batch conflicts created
    - Lab synchronization maintained (or warns)

    Returns updated slot.
    """
    # Fetch slot with relations
    slot = await _get_slot_with_relations(db, body.slot_id)

    if not slot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Slot {body.slot_id} not found",
        )

    # Parse target day
    try:
        target_day = DayOfWeek(body.target_day.upper())
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid day: {body.target_day}. Must be one of: MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY",
        )

    # Validate the move
    conflicts = await _validate_slot_move(db, slot, target_day, body.target_slot_index)

    if conflicts:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "Move would create conflicts",
                "conflicts": conflicts,
            },
        )

    # Handle lab synchronization - move linked lab slots together
    lab_slots = await _get_lab_group_slots(
        db, slot.run_id, slot.batch_id, slot.day, slot.slot_index
    )

    # Perform the move
    old_day = slot.day
    old_slot_index = slot.slot_index
    slot.day = target_day
    slot.slot_index = body.target_slot_index

    # Move linked lab slots
    for lab_slot in lab_slots:
        lab_slot.day = target_day
        lab_slot.slot_index = body.target_slot_index

    await db.flush()

    # Reload slot with fresh data
    updated_slot = await _get_slot_with_relations(db, slot.id)

    return {
        "message": "Slot moved successfully",
        "slot": _serialize_slot(updated_slot),
        "previous": {
            "day": old_day.value,
            "slot_index": old_slot_index,
        },
        "lab_slots_moved": len(lab_slots),
    }


@router.post("/validate-move")
async def validate_slot_move_endpoint(
    body: SlotMoveIn, db: AsyncSession = Depends(get_db)
) -> ConflictCheckResult:
    """
    Validate a potential slot move without actually performing it.

    Returns validation result with any conflicts that would occur.
    """
    # Fetch slot with relations
    slot = await _get_slot_with_relations(db, body.slot_id)

    if not slot:
        return ConflictCheckResult(
            valid=False, conflicts=[f"Slot {body.slot_id} not found"]
        )

    # Parse target day
    try:
        target_day = DayOfWeek(body.target_day.upper())
    except ValueError:
        return ConflictCheckResult(
            valid=False,
            conflicts=[
                f"Invalid day: {body.target_day}. Must be one of: MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY"
            ],
        )

    # Validate the move
    conflicts = await _validate_slot_move(db, slot, target_day, body.target_slot_index)

    return ConflictCheckResult(
        valid=len(conflicts) == 0,
        conflicts=conflicts,
    )
