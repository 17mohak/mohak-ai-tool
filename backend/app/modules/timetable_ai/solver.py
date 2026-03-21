"""
Timetable CP-SAT Solver v2.1 (Fixed)
====================================
Production-grade constraint-programming engine that generates a
conflict-free weekly class schedule for a given department.

Uses Google OR-Tools CP-SAT to enforce hard constraints:
  1. Subject Fulfillment    – each (batch, subject) pair meets exactly `credits` times.
  2. Teacher Conflict       – a teacher appears in at most one slot per (day, period).
  3. Room Conflict          – a room is used by at most one class per (day, period).
  4. Batch Conflict         – a batch attends at most one class per (day, period).
  5. Teacher Max/Day        – teacher max_classes_per_day enforced.
  6. Batch Max/Day          – batch max_classes_per_day enforced.
  7. Teacher Unavailability – teachers not scheduled during unavailable slots.
  8. Pinned Slots           – subjects pinned to specific (day, slot) pairs.
  9. Parent-Child Exclusion – parent batch (theory) cannot overlap with sub-batches (labs).
  10. Lab Synchronization   – all sub-batches of same parent run simultaneously.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from ortools.sat.python import cp_model
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.timetable import (
    Batch,
    DayOfWeek,
    Department,
    PinnedSlot,
    Room,
    RunStatus,
    ScheduleSlot,
    Subject,
    Teacher,
    TeacherUnavailability,
    TimetableRun,
)

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────
# Constants (Must match backend exactly)
# ──────────────────────────────────────────────
DAYS: list[DayOfWeek] = [
    DayOfWeek.MONDAY,
    DayOfWeek.TUESDAY,
    DayOfWeek.WEDNESDAY,
    DayOfWeek.THURSDAY,
    DayOfWeek.FRIDAY,
]

SLOTS: list[dict[str, Any]] = [
    {"index": 0, "label": "09:00 – 10:30"},
    {"index": 1, "label": "11:00 – 12:30"},
    {"index": 2, "label": "14:00 – 15:30"},
    {"index": 3, "label": "16:00 – 17:30"},
]
SLOT_INDICES: list[int] = [s["index"] for s in SLOTS]

NUM_DAYS = len(DAYS)
NUM_SLOTS = len(SLOT_INDICES)
TOTAL_WEEKLY_PERIODS = NUM_DAYS * NUM_SLOTS  # 20


# ──────────────────────────────────────────────
# Post-Solution Validation
# ──────────────────────────────────────────────
def _validate_solution(
    schedule: list[dict],
    teachers: list[dict],
    subjects: list[dict],
    rooms: list[dict],
    batches: list[dict],
    unavailabilities: list[dict],
    pinned_slots: list[dict],
) -> list[str]:
    """
    Post-solution validation to detect any constraint violations.
    Returns list of violations (empty if valid).
    """
    violations = []
    teacher_map = {t["id"]: t for t in teachers}
    batch_map = {b["id"]: b for b in batches}
    subject_map = {s["id"]: s for s in subjects}
    room_map = {r["id"]: r for r in rooms}

    # Build unavailability lookup
    unavailable_set = set()
    for u in unavailabilities:
        unavailable_set.add((u["teacher_id"], u["day"], u["slot_index"]))

    # Build pinned lookup
    pinned_map = {}
    for p in pinned_slots:
        pinned_map[p["subject_id"]] = (p["day"], p["slot_index"])

    # Build lookup tables
    teacher_slots: dict[tuple, list] = {}
    room_slots: dict[tuple, list] = {}
    batch_slots: dict[tuple, list] = {}
    batch_all_slots: dict[int, list] = {}
    teacher_all_slots: dict[int, list] = {}

    for slot in schedule:
        teacher_id = slot["teacher_id"]
        room_id = slot["room_id"]
        batch_id = slot["batch_id"]
        day = slot["day"]
        slot_idx = slot["slot_index"]

        t_key = (teacher_id, day, slot_idx)
        r_key = (room_id, day, slot_idx)
        b_key = (batch_id, day, slot_idx)

        teacher_slots.setdefault(t_key, []).append(slot)
        room_slots.setdefault(r_key, []).append(slot)
        batch_slots.setdefault(b_key, []).append(slot)
        batch_all_slots.setdefault(batch_id, []).append(slot)
        teacher_all_slots.setdefault(teacher_id, []).append(slot)

    # Check 1: Teacher conflicts
    for (t_id, day, slot_idx), slots in teacher_slots.items():
        if len(slots) > 1:
            teacher_name = teacher_map.get(t_id, {}).get("name", str(t_id))
            violations.append(
                f"TEACHER CONFLICT: {teacher_name} at {day}/slot {slot_idx} ({len(slots)} classes)"
            )

    # Check 2: Room conflicts
    for (r_id, day, slot_idx), slots in room_slots.items():
        if len(slots) > 1:
            room_name = room_map.get(r_id, {}).get("name", str(r_id))
            violations.append(
                f"ROOM CONFLICT: {room_name} at {day}/slot {slot_idx} ({len(slots)} classes)"
            )

    # Check 3: Batch conflicts
    for (b_id, day, slot_idx), slots in batch_slots.items():
        if len(slots) > 1:
            batch_name = batch_map.get(b_id, {}).get("name", str(b_id))
            violations.append(
                f"BATCH CONFLICT: {batch_name} at {day}/slot {slot_idx} ({len(slots)} classes)"
            )

    # Check 4: Teacher max per day
    for t_id, slots in teacher_all_slots.items():
        teacher = teacher_map.get(t_id, {})
        max_per_day = teacher.get("max_classes_per_day", 4)
        by_day: dict[str, list] = {}
        for slot in slots:
            by_day.setdefault(slot["day"], []).append(slot)
        for day, day_slots in by_day.items():
            if len(day_slots) > max_per_day:
                teacher_name = teacher.get("name", str(t_id))
                violations.append(
                    f"TEACHER MAX/DAY: {teacher_name} on {day} has {len(day_slots)} classes (max {max_per_day})"
                )

    # Check 5: Batch max per day
    for b_id, slots in batch_all_slots.items():
        batch = batch_map.get(b_id, {})
        max_per_day = batch.get("max_classes_per_day", 6)
        by_day: dict[str, list] = {}
        for slot in slots:
            by_day.setdefault(slot["day"], []).append(slot)
        for day, day_slots in by_day.items():
            if len(day_slots) > max_per_day:
                batch_name = batch.get("name", str(b_id))
                violations.append(
                    f"BATCH MAX/DAY: {batch_name} on {day} has {len(day_slots)} classes (max {max_per_day})"
                )

    # Check 6: Subject fulfillment
    batch_subject_count: dict[tuple, int] = {}
    for slot in schedule:
        key = (slot["batch_id"], slot["subject_id"])
        batch_subject_count[key] = batch_subject_count.get(key, 0) + 1

    for s in subjects:
        key = (s["batch_id"], s["id"])
        actual = batch_subject_count.get(key, 0)
        expected = s["credits"]
        if actual != expected:
            violations.append(
                f"CREDIT MISMATCH: {s['name']} has {actual} slots, expected {expected}"
            )

    # Check 7: Teacher unavailability
    for slot in schedule:
        key = (slot["teacher_id"], slot["day"], slot["slot_index"])
        if key in unavailable_set:
            teacher_name = teacher_map.get(slot["teacher_id"], {}).get(
                "name", "Unknown"
            )
            violations.append(
                f"UNAVAILABILITY: {teacher_name} scheduled during unavailable slot {slot['day']}/{slot['slot_index']}"
            )

    # Check 8: Pinned slots
    for slot in schedule:
        subject_id = slot["subject_id"]
        if subject_id in pinned_map:
            expected_day, expected_slot = pinned_map[subject_id]
            if slot["day"] != expected_day or slot["slot_index"] != expected_slot:
                subject = subject_map.get(subject_id, {})
                violations.append(
                    f"PINNED: {subject.get('name', subject_id)} at {slot['day']}/{slot['slot_index']}, expected {expected_day}/{expected_slot}"
                )

    return violations


# ──────────────────────────────────────────────
# Data Fetching
# ──────────────────────────────────────────────
async def _fetch_department_data(
    db: AsyncSession,
    department_id: int,
) -> tuple:
    """Load all domain entities that belong to *department_id*."""

    teachers_result = await db.execute(
        select(Teacher).where(Teacher.department_id == department_id)
    )
    teachers = list(teachers_result.scalars().all())

    subjects_result = await db.execute(
        select(Subject).where(Subject.department_id == department_id)
    )
    subjects = list(subjects_result.scalars().all())

    rooms_result = await db.execute(select(Room))
    rooms = list(rooms_result.scalars().all())

    batches_result = await db.execute(
        select(Batch).where(Batch.department_id == department_id)
    )
    batches = list(batches_result.scalars().all())

    teacher_ids = [t.id for t in teachers]
    unavail_result = await db.execute(
        select(TeacherUnavailability).where(
            TeacherUnavailability.teacher_id.in_(teacher_ids)
        )
        if teacher_ids
        else select(TeacherUnavailability).where(TeacherUnavailability.id < 0)
    )
    unavailabilities = list(unavail_result.scalars().all())

    subject_ids = [s.id for s in subjects]
    pinned_result = await db.execute(
        select(PinnedSlot).where(PinnedSlot.subject_id.in_(subject_ids))
        if subject_ids
        else select(PinnedSlot).where(PinnedSlot.id < 0)
    )
    pinned_slots = list(pinned_result.scalars().all())

    return teachers, subjects, rooms, batches, unavailabilities, pinned_slots


# ──────────────────────────────────────────────
# Solver Core
# ──────────────────────────────────────────────
def _solve(
    teachers: list[dict],
    subjects: list[dict],
    rooms: list[dict],
    batches: list[dict],
    unavailabilities: list[dict],
    pinned_slots: list[dict],
    random_seed: int | None = None,
    variant_id: int = 0,
) -> dict:
    """Build and solve the CP-SAT model."""

    teacher_map = {t["id"]: t for t in teachers}
    batch_map = {b["id"]: b for b in batches}
    subject_map = {s["id"]: s for s in subjects}

    # Map parent_batch_id -> list of sub-batch IDs
    parent_to_subbatches: dict[int, list[int]] = {}
    for b in batches:
        parent_id = b.get("parent_batch_id")
        if parent_id is not None:
            parent_to_subbatches.setdefault(parent_id, []).append(b["id"])

    if not teachers:
        return {"status": "INFEASIBLE", "reason": "No teachers found."}

    model = cp_model.CpModel()

    # ── Decision Variables ───────────────────
    # x[b_id, s_id, t_id, r_id, d_idx, p] ∈ {0, 1}
    x: dict[tuple, Any] = {}

    for s in subjects:
        b_id = s["batch_id"]
        t_id = s["teacher_id"]
        b = batch_map.get(b_id)
        if b is None:
            continue

        is_lab_subject = b.get("parent_batch_id") is not None

        for r in rooms:
            if is_lab_subject and not r.get("is_lab", False):
                continue
            if not is_lab_subject and r.get("is_lab", False):
                continue
            if r["capacity"] < b["size"]:
                continue
            for d_idx in range(NUM_DAYS):
                for p in SLOT_INDICES:
                    key = (b_id, s["id"], t_id, r["id"], d_idx, p)
                    var_name = f"x_b{b_id}_s{s['id']}_t{t_id}_r{r['id']}_d{d_idx}_p{p}"
                    x[key] = model.NewBoolVar(var_name)

    if not x:
        return {
            "status": "INFEASIBLE",
            "reason": "No valid variable combinations exist.",
        }

    # Build lookup tables
    unavailable_set = set()
    for u in unavailabilities:
        day_idx = DAYS.index(DayOfWeek(u["day"]))
        unavailable_set.add((u["teacher_id"], day_idx, u["slot_index"]))

    pinned_map = {}
    for p in pinned_slots:
        day_idx = DAYS.index(DayOfWeek(p["day"]))
        pinned_map[p["subject_id"]] = (day_idx, p["slot_index"])

    # ── HARD CONSTRAINT 1: Subject Fulfillment ──
    for s in subjects:
        b_id = s["batch_id"]
        t_id = s["teacher_id"]
        if b_id not in batch_map:
            continue
        slot_vars = [
            x[key]
            for key in x
            if key[0] == b_id and key[1] == s["id"] and key[2] == t_id
        ]
        if slot_vars:
            model.Add(sum(slot_vars) == s["credits"])
        else:
            return {
                "status": "INFEASIBLE",
                "reason": f"No valid slots for subject '{s['name']}'",
            }

    # ── HARD CONSTRAINT 2: Teacher Conflict ──
    for t in teachers:
        for d_idx in range(NUM_DAYS):
            for p in SLOT_INDICES:
                vars_for_teacher = [
                    x[key]
                    for key in x
                    if key[2] == t["id"] and key[4] == d_idx and key[5] == p
                ]
                if vars_for_teacher:
                    model.Add(sum(vars_for_teacher) <= 1)

    # ── HARD CONSTRAINT 3: Room Conflict ──
    for r in rooms:
        for d_idx in range(NUM_DAYS):
            for p in SLOT_INDICES:
                vars_for_room = [
                    x[key]
                    for key in x
                    if key[3] == r["id"] and key[4] == d_idx and key[5] == p
                ]
                if vars_for_room:
                    model.Add(sum(vars_for_room) <= 1)

    # ── HARD CONSTRAINT 4: Batch Conflict ──
    for b in batches:
        for d_idx in range(NUM_DAYS):
            for p in SLOT_INDICES:
                vars_for_batch = [
                    x[key]
                    for key in x
                    if key[0] == b["id"] and key[4] == d_idx and key[5] == p
                ]
                if vars_for_batch:
                    model.Add(sum(vars_for_batch) <= 1)

    # ── HARD CONSTRAINT 5: Teacher Max/Day ──
    for t in teachers:
        max_per_day = t.get("max_classes_per_day", 4)
        for d_idx in range(NUM_DAYS):
            vars_for_teacher_day = [
                x[key] for key in x if key[2] == t["id"] and key[4] == d_idx
            ]
            if vars_for_teacher_day:
                model.Add(sum(vars_for_teacher_day) <= max_per_day)

    # ── HARD CONSTRAINT 6: Batch Max/Day ──
    for b in batches:
        max_per_day = b.get("max_classes_per_day", 6)
        for d_idx in range(NUM_DAYS):
            vars_for_batch_day = [
                x[key] for key in x if key[0] == b["id"] and key[4] == d_idx
            ]
            if vars_for_batch_day:
                model.Add(sum(vars_for_batch_day) <= max_per_day)

    # ── HARD CONSTRAINT 7: Teacher Unavailability ──
    for key in x:
        b_id, s_id, t_id, r_id, d_idx, p = key
        if (t_id, d_idx, p) in unavailable_set:
            model.Add(x[key] == 0)

    # ── HARD CONSTRAINT 8: Pinned Slots ──
    for s in subjects:
        if s["id"] in pinned_map:
            pinned_day_idx, pinned_slot_idx = pinned_map[s["id"]]
            b_id = s["batch_id"]
            t_id = s["teacher_id"]

            pinned_vars = [
                x[key]
                for key in x
                if key[0] == b_id
                and key[1] == s["id"]
                and key[2] == t_id
                and key[4] == pinned_day_idx
                and key[5] == pinned_slot_idx
            ]

            if pinned_vars:
                model.Add(sum(pinned_vars) == s["credits"])
            else:
                return {
                    "status": "INFEASIBLE",
                    "reason": f"Subject '{s['name']}' pinned to invalid slot",
                }

            other_vars = [
                x[key]
                for key in x
                if key[0] == b_id
                and key[1] == s["id"]
                and key[2] == t_id
                and (key[4] != pinned_day_idx or key[5] != pinned_slot_idx)
            ]
            for var in other_vars:
                model.Add(var == 0)

    # ── HARD CONSTRAINT 9: Parent-Child Exclusion ──
    for parent_id, sub_ids in parent_to_subbatches.items():
        for d_idx in range(NUM_DAYS):
            for p in SLOT_INDICES:
                parent_vars = [
                    x[key]
                    for key in x
                    if key[0] == parent_id and key[4] == d_idx and key[5] == p
                ]
                sub_vars = [
                    x[key]
                    for key in x
                    if key[0] in sub_ids and key[4] == d_idx and key[5] == p
                ]
                if parent_vars and sub_vars:
                    model.Add(sum(parent_vars) + sum(sub_vars) <= 1)

    # ── HARD CONSTRAINT 10: Lab Synchronization ──
    # FIXED: All sub-batches of same parent must run simultaneously
    for parent_id, sub_ids in parent_to_subbatches.items():
        # Get total credits per sub-batch
        sub_credits = {}
        for sub_id in sub_ids:
            sub_credits[sub_id] = sum(
                s["credits"] for s in subjects if s["batch_id"] == sub_id
            )

        for d_idx in range(NUM_DAYS):
            for p in SLOT_INDICES:
                # Create indicator if this slot is used by any sub-batch
                slot_used = model.NewBoolVar(f"lab_sync_{parent_id}_d{d_idx}_p{p}")

                # Collect all vars for all sub-batches at this slot
                all_sub_vars = []
                sub_batch_indicators = []

                for sub_id in sub_ids:
                    sub_vars = [
                        x[key]
                        for key in x
                        if key[0] == sub_id and key[4] == d_idx and key[5] == p
                    ]
                    if sub_vars:
                        all_sub_vars.extend(sub_vars)
                        # Create indicator if this specific sub-batch uses this slot
                        sub_has_class = model.NewBoolVar(f"sub_{sub_id}_d{d_idx}_p{p}")
                        # sub_has_class = 1 iff sum(sub_vars) > 0
                        model.AddMaxEquality(sub_has_class, sub_vars)
                        sub_batch_indicators.append(sub_has_class)

                if all_sub_vars:
                    # slot_used = 1 if any sub-batch has a class
                    model.AddMaxEquality(slot_used, sub_batch_indicators)

                    # All sub-batches must have the same "has_class" status
                    for i in range(len(sub_batch_indicators)):
                        for j in range(i + 1, len(sub_batch_indicators)):
                            model.Add(
                                sub_batch_indicators[i] == sub_batch_indicators[j]
                            )

    # ── Objective ──
    obj_terms = []
    for key, var in x.items():
        b_id, s_id, t_id, r_id, d_idx, p = key
        obj_terms.append(p * var)
    model.Minimize(sum(obj_terms))

    # ── Solve ──
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 60.0
    solver.parameters.num_workers = 4
    solver.parameters.log_search_progress = False

    if random_seed is not None:
        solver.parameters.random_seed = random_seed

    logger.info("CP-SAT solver started (variant=%s, seed=%s)", variant_id, random_seed)
    status = solver.Solve(model)
    logger.info("CP-SAT solver finished – status=%s", solver.StatusName(status))

    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        schedule = []
        for key, var in x.items():
            if solver.Value(var) == 1:
                b_id, s_id, t_id, r_id, d_idx, p = key
                schedule.append(
                    {
                        "batch_id": b_id,
                        "subject_id": s_id,
                        "teacher_id": t_id,
                        "room_id": r_id,
                        "day": DAYS[d_idx].value,
                        "slot_index": p,
                    }
                )

        schedule.sort(key=lambda e: (e["batch_id"], e["day"], e["slot_index"]))

        # Post-solution validation
        violations = _validate_solution(
            schedule, teachers, subjects, rooms, batches, unavailabilities, pinned_slots
        )
        if violations:
            logger.error("Solution validation failed: %s", violations)
            return {
                "status": "INFEASIBLE",
                "reason": f"Validation failed: {'; '.join(violations[:3])}",
                "diagnostics": violations,
            }

        return {
            "status": "SUCCESS",
            "schedule": schedule,
            "variant_id": variant_id,
            "objective_value": solver.ObjectiveValue(),
        }

    # Build detailed infeasibility reason
    reason_parts = []
    diagnostics = []

    # Check pinned slots
    for s in subjects:
        if s["id"] in pinned_map:
            pinned_day_idx, pinned_slot_idx = pinned_map[s["id"]]
            t_id = s["teacher_id"]
            if (t_id, pinned_day_idx, pinned_slot_idx) in unavailable_set:
                msg = f"Pinned conflict: subject '{s['name']}' pinned but teacher unavailable"
                reason_parts.append(msg)
                diagnostics.append(msg)

    # Check credit overload
    for b in batches:
        batch_subjects = [s for s in subjects if s["batch_id"] == b["id"]]
        total_credits = sum(s["credits"] for s in batch_subjects)
        if total_credits > TOTAL_WEEKLY_PERIODS:
            msg = f"Batch '{b['name']}': {total_credits} credits > {TOTAL_WEEKLY_PERIODS} slots"
            reason_parts.append(msg)
            diagnostics.append(msg)

    # Check room capacity
    for b in batches:
        suitable = [r for r in rooms if r["capacity"] >= b["size"]]
        if not suitable:
            msg = f"No room for batch '{b['name']}' (size {b['size']})"
            reason_parts.append(msg)
            diagnostics.append(msg)

    if reason_parts:
        reason = " | ".join(reason_parts)
    else:
        reason = "Constraints could not be satisfied. Check resources."

    return {
        "status": "INFEASIBLE",
        "reason": reason,
        "variant_id": variant_id,
        "diagnostics": diagnostics if diagnostics else None,
    }


# ──────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────
async def generate_schedule(
    db: AsyncSession,
    department_id: int,
    variant_id: int = 0,
    random_seed: int | None = None,
) -> dict:
    """Generate a conflict-free weekly timetable for *department_id*."""

    (
        teachers,
        subjects,
        rooms,
        batches,
        unavailabilities,
        pinned_slots,
    ) = await _fetch_department_data(db, department_id)

    if not teachers:
        return {"status": "INFEASIBLE", "reason": "No teachers found."}
    if not subjects:
        return {"status": "INFEASIBLE", "reason": "No subjects found."}
    if not rooms:
        return {"status": "INFEASIBLE", "reason": "No rooms found."}
    if not batches:
        return {"status": "INFEASIBLE", "reason": "No batches found."}

    # Validate credit load per batch
    for batch in batches:
        batch_subjects = [s for s in subjects if s.batch_id == batch.id]
        total_credits = sum(s.credits for s in batch_subjects)
        if total_credits > TOTAL_WEEKLY_PERIODS:
            return {
                "status": "INFEASIBLE",
                "reason": f"Batch '{batch.name}': {total_credits} credits > {TOTAL_WEEKLY_PERIODS} slots",
            }

    # Serialize to dicts
    teachers_data = [
        {"id": t.id, "name": t.name, "max_classes_per_day": t.max_classes_per_day}
        for t in teachers
    ]
    subjects_data = [
        {
            "id": s.id,
            "name": s.name,
            "credits": s.credits,
            "batch_id": s.batch_id,
            "teacher_id": s.teacher_id,
        }
        for s in subjects
        if s.batch_id and s.teacher_id
    ]
    rooms_data = [
        {"id": r.id, "name": r.name, "capacity": r.capacity, "is_lab": r.is_lab}
        for r in rooms
    ]
    batches_data = [
        {
            "id": b.id,
            "name": b.name,
            "size": b.size,
            "max_classes_per_day": b.max_classes_per_day,
            "parent_batch_id": b.parent_batch_id,
        }
        for b in batches
    ]
    unavail_data = [
        {"teacher_id": u.teacher_id, "day": u.day.value, "slot_index": u.slot_index}
        for u in unavailabilities
    ]
    pinned_data = [
        {"subject_id": p.subject_id, "day": p.day.value, "slot_index": p.slot_index}
        for p in pinned_slots
    ]

    if not subjects_data:
        return {"status": "INFEASIBLE", "reason": "No subjects with assignments."}

    result = await asyncio.to_thread(
        _solve,
        teachers_data,
        subjects_data,
        rooms_data,
        batches_data,
        unavail_data,
        pinned_data,
        random_seed=random_seed,
        variant_id=variant_id,
    )

    run = TimetableRun(
        department_id=department_id,
        solver_status=result.get("status", "UNKNOWN"),
        status=RunStatus.DRAFT
        if result.get("status") == "SUCCESS"
        else RunStatus.FAILED,
        reason=result.get("reason"),
    )
    db.add(run)
    await db.flush()

    if result.get("status") == "SUCCESS":
        for entry in result.get("schedule", []):
            slot = ScheduleSlot(
                run_id=run.id,
                batch_id=entry["batch_id"],
                subject_id=entry["subject_id"],
                teacher_id=entry["teacher_id"],
                room_id=entry["room_id"],
                day=DayOfWeek(entry["day"]),
                slot_index=entry["slot_index"],
            )
            db.add(slot)
        await db.commit()
        result["run_id"] = run.id
        result["slots_created"] = len(result["schedule"])
    else:
        await db.commit()
        result["run_id"] = run.id

    return result


async def generate_schedule_variants(
    db: AsyncSession,
    department_id: int,
    num_variants: int = 3,
) -> list[dict]:
    """Generate multiple different timetable variants."""
    results = []
    for i in range(num_variants):
        result = await generate_schedule(
            db=db,
            department_id=department_id,
            variant_id=i,
            random_seed=42 + i * 17,
        )
        result["variant"] = f"V{i + 1}"
        results.append(result)
    return results
