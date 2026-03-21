"""
Staff API endpoints for the Smart Class Scheduler.

Staff capabilities:
- View ONLY their timetable (after it's PUBLISHED)
- Set preferred working hours
- Set unavailability
- Apply for leaves

Staff CANNOT:
- Generate timetables
- Edit subjects/batches
- See drafts
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import joinedload
from datetime import date

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.authz import authz_engine
from app.models.user import User, UserRole
from app.models.timetable import (
    Teacher,
    TeacherUnavailability,
    LeaveApplication,
    ScheduleSlot,
    TimetableRun,
    RunStatus,
    DayOfWeek,
)

router = APIRouter(prefix="/staff", tags=["staff"])


# Permission check helper
async def require_staff_or_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    """Ensure user is STAFF or ADMIN."""
    if current_user.role not in [UserRole.STAFF, UserRole.ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Staff access required",
        )
    return current_user


async def require_linked_teacher(
    user: User,
    db: AsyncSession,
) -> Teacher:
    """Get the teacher linked to the user, or raise error."""
    if not user.teacher_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not linked to a teacher profile",
        )
    result = await db.execute(select(Teacher).where(Teacher.id == user.teacher_id))
    teacher = result.scalar_one_or_none()
    if not teacher:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Teacher profile not found",
        )
    return teacher


# ============== TIMETABLE VIEWING ==============


@router.get("/my-timetable")
async def get_my_timetable(
    current_user: User = Depends(require_staff_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Get staff's own timetable.
    Only returns data if the timetable is PUBLISHED.
    """
    teacher = await require_linked_teacher(current_user, db)

    # Find the latest PUBLISHED run for this teacher's department
    run_q = await db.execute(
        select(TimetableRun)
        .where(
            and_(
                TimetableRun.department_id == teacher.department_id,
                TimetableRun.status == RunStatus.PUBLISHED,
            )
        )
        .order_by(TimetableRun.created_at.desc())
        .limit(1)
    )
    run = run_q.scalar_one_or_none()

    if not run:
        return {
            "teacher": teacher.name,
            "slots": [],
            "message": "No published timetable available yet.",
        }

    # Get only this teacher's slots from the published timetable
    slots_q = await db.execute(
        select(ScheduleSlot)
        .where(
            and_(ScheduleSlot.run_id == run.id, ScheduleSlot.teacher_id == teacher.id)
        )
        .options(
            joinedload(ScheduleSlot.subject),
            joinedload(ScheduleSlot.room),
            joinedload(ScheduleSlot.batch),
        )
    )
    slots = slots_q.scalars().all()

    # Fixed slot map matching the solver constants
    SLOT_MAP = {
        0: {"start": "09:00", "end": "10:30", "label": "09:00 – 10:30"},
        1: {"start": "11:00", "end": "12:30", "label": "11:00 – 12:30"},
        2: {"start": "14:00", "end": "15:30", "label": "14:00 – 15:30"},
        3: {"start": "16:00", "end": "17:30", "label": "16:00 – 17:30"},
    }

    formatted = []
    for slot in slots:
        time_info = SLOT_MAP.get(slot.slot_index, {})
        formatted.append(
            {
                "id": slot.id,
                "batch": slot.batch.name if slot.batch else "—",
                "subject": slot.subject.name if slot.subject else "—",
                "room": slot.room.name if slot.room else "—",
                "day": slot.day.value if hasattr(slot.day, "value") else slot.day,
                "slot_index": slot.slot_index,
                "start_time": time_info.get("start", ""),
                "end_time": time_info.get("end", ""),
                "time_label": time_info.get("label", ""),
            }
        )

    return {
        "teacher": teacher.name,
        "department": teacher.department.name if teacher.department else None,
        "run": {
            "id": run.id,
            "status": run.status.value,
            "created_at": run.created_at.isoformat() if run.created_at else None,
        },
        "slots": formatted,
    }


# ============== WORKING HOURS ==============


class WorkingHoursUpdate(BaseModel):
    preferred_start_slot: int
    preferred_end_slot: int
    max_classes_per_day: int


@router.get("/my-working-hours")
async def get_my_working_hours(
    current_user: User = Depends(require_staff_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get staff's preferred working hours."""
    teacher = await require_linked_teacher(current_user, db)

    return {
        "teacher_id": teacher.id,
        "teacher_name": teacher.name,
        "preferred_start_slot": teacher.preferred_start_slot,
        "preferred_end_slot": teacher.preferred_end_slot,
        "max_classes_per_day": teacher.max_classes_per_day,
    }


@router.put("/my-working-hours")
async def update_my_working_hours(
    body: WorkingHoursUpdate,
    current_user: User = Depends(require_staff_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update staff's preferred working hours."""
    teacher = await require_linked_teacher(current_user, db)

    teacher.preferred_start_slot = body.preferred_start_slot
    teacher.preferred_end_slot = body.preferred_end_slot
    teacher.max_classes_per_day = body.max_classes_per_day

    await db.commit()
    await db.refresh(teacher)

    return {
        "message": "Working hours updated successfully",
        "teacher_id": teacher.id,
        "preferred_start_slot": teacher.preferred_start_slot,
        "preferred_end_slot": teacher.preferred_end_slot,
        "max_classes_per_day": teacher.max_classes_per_day,
    }


# ============== UNAVAILABILITY ==============


class UnavailabilityCreate(BaseModel):
    day: str  # MONDAY, TUESDAY, etc.
    slot_index: int  # 0, 1, 2, 3


@router.get("/my-unavailability")
async def get_my_unavailability(
    current_user: User = Depends(require_staff_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get staff's unavailability slots."""
    teacher = await require_linked_teacher(current_user, db)

    result = await db.execute(
        select(TeacherUnavailability)
        .where(TeacherUnavailability.teacher_id == teacher.id)
        .order_by(TeacherUnavailability.day, TeacherUnavailability.slot_index)
    )
    unavailabilities = result.scalars().all()

    return {
        "teacher_id": teacher.id,
        "teacher_name": teacher.name,
        "unavailabilities": [
            {
                "id": u.id,
                "day": u.day.value,
                "slot_index": u.slot_index,
            }
            for u in unavailabilities
        ],
    }


@router.post("/my-unavailability")
async def add_my_unavailability(
    body: UnavailabilityCreate,
    current_user: User = Depends(require_staff_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """Add an unavailability slot for staff."""
    teacher = await require_linked_teacher(current_user, db)

    # Validate day
    try:
        day_enum = DayOfWeek(body.day.upper())
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid day. Must be one of: {[d.value for d in DayOfWeek]}",
        )

    # Check if already exists
    existing = await db.execute(
        select(TeacherUnavailability).where(
            and_(
                TeacherUnavailability.teacher_id == teacher.id,
                TeacherUnavailability.day == day_enum,
                TeacherUnavailability.slot_index == body.slot_index,
            )
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unavailability slot already exists",
        )

    unavail = TeacherUnavailability(
        teacher_id=teacher.id,
        day=day_enum,
        slot_index=body.slot_index,
    )
    db.add(unavail)
    await db.commit()
    await db.refresh(unavail)

    return {
        "message": "Unavailability added successfully",
        "id": unavail.id,
        "day": unavail.day.value,
        "slot_index": unavail.slot_index,
    }


@router.delete("/my-unavailability/{unavailability_id}")
async def delete_my_unavailability(
    unavailability_id: int,
    current_user: User = Depends(require_staff_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete an unavailability slot."""
    teacher = await require_linked_teacher(current_user, db)

    result = await db.execute(
        select(TeacherUnavailability).where(
            and_(
                TeacherUnavailability.id == unavailability_id,
                TeacherUnavailability.teacher_id == teacher.id,
            )
        )
    )
    unavail = result.scalar_one_or_none()

    if not unavail:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Unavailability slot not found",
        )

    await db.delete(unavail)
    await db.commit()

    return {"message": "Unavailability deleted successfully"}


# ============== LEAVE APPLICATIONS ==============


class LeaveApplicationCreate(BaseModel):
    start_date: date
    end_date: date
    reason: str | None = None


@router.get("/my-leaves")
async def get_my_leaves(
    current_user: User = Depends(require_staff_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get staff's leave applications."""
    teacher = await require_linked_teacher(current_user, db)

    result = await db.execute(
        select(LeaveApplication)
        .where(LeaveApplication.teacher_id == teacher.id)
        .order_by(LeaveApplication.created_at.desc())
    )
    leaves = result.scalars().all()

    return {
        "teacher_id": teacher.id,
        "teacher_name": teacher.name,
        "leaves": [
            {
                "id": leave.id,
                "start_date": leave.start_date.isoformat()
                if leave.start_date
                else None,
                "end_date": leave.end_date.isoformat() if leave.end_date else None,
                "reason": leave.reason,
                "status": leave.status,
                "created_at": leave.created_at.isoformat()
                if leave.created_at
                else None,
            }
            for leave in leaves
        ],
    }


@router.post("/my-leaves")
async def apply_for_leave(
    body: LeaveApplicationCreate,
    current_user: User = Depends(require_staff_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """Apply for leave."""
    teacher = await require_linked_teacher(current_user, db)

    if body.end_date < body.start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="End date must be after start date",
        )

    leave = LeaveApplication(
        teacher_id=teacher.id,
        start_date=body.start_date,
        end_date=body.end_date,
        reason=body.reason,
        status="PENDING",
    )
    db.add(leave)
    await db.commit()
    await db.refresh(leave)

    return {
        "message": "Leave application submitted successfully",
        "leave": {
            "id": leave.id,
            "start_date": leave.start_date.isoformat() if leave.start_date else None,
            "end_date": leave.end_date.isoformat() if leave.end_date else None,
            "reason": leave.reason,
            "status": leave.status,
            "created_at": leave.created_at.isoformat() if leave.created_at else None,
        },
    }


@router.delete("/my-leaves/{leave_id}")
async def cancel_leave(
    leave_id: int,
    current_user: User = Depends(require_staff_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """Cancel a pending leave application."""
    teacher = await require_linked_teacher(current_user, db)

    result = await db.execute(
        select(LeaveApplication).where(
            and_(
                LeaveApplication.id == leave_id,
                LeaveApplication.teacher_id == teacher.id,
            )
        )
    )
    leave = result.scalar_one_or_none()

    if not leave:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Leave application not found",
        )

    if leave.status != "PENDING":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only cancel pending leave applications",
        )

    await db.delete(leave)
    await db.commit()

    return {"message": "Leave application cancelled successfully"}
