"""
Timetable CP-SAT Solver
========================
Production-grade constraint-programming engine that generates a
conflict-free weekly class schedule for a given department.

Uses Google OR-Tools CP-SAT to enforce hard constraints:
  1. Subject Fulfillment  – each (batch, subject) pair meets exactly `credits` times.
  2. Teacher Conflict     – a teacher appears in at most one slot per (day, period).
  3. Room Conflict        – a room is used by at most one class per (day, period).
  4. Batch Conflict       – a batch attends at most one class per (day, period).

The heavy CP-SAT solve is offloaded to a thread via ``asyncio.to_thread``
so the FastAPI event loop is never blocked.

After a successful solve the schedule is persisted as ScheduleSlot rows
linked to a new TimetableRun.
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
    Room,
    RunStatus,
    ScheduleSlot,
    Subject,
    Teacher,
    TimetableRun,
)

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────
# Constants
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
# Name-based resolution helpers
# ──────────────────────────────────────────────
async def resolve_department(db: AsyncSession, name: str) -> Department | None:
    """Case-insensitive department lookup by name."""
    result = await db.execute(
        select(Department).where(Department.name.ilike(name))
    )
    return result.scalar_one_or_none()


async def list_departments(db: AsyncSession) -> list[Department]:
    result = await db.execute(select(Department).order_by(Department.name))
    return list(result.scalars().all())


async def list_batches_for_department(
    db: AsyncSession, department_id: int
) -> list[Batch]:
    result = await db.execute(
        select(Batch)
        .where(Batch.department_id == department_id)
        .order_by(Batch.name)
    )
    return list(result.scalars().all())


# ──────────────────────────────────────────────
# Data Fetching
# ──────────────────────────────────────────────
async def _fetch_department_data(
    db: AsyncSession,
    department_id: int,
) -> tuple[list[Teacher], list[Subject], list[Room], list[Batch]]:
    """Load all domain entities that belong to *department_id*."""

    teachers_result = await db.execute(
        select(Teacher).where(Teacher.department_id == department_id)
    )
    teachers: list[Teacher] = list(teachers_result.scalars().all())

    subjects_result = await db.execute(
        select(Subject).where(Subject.department_id == department_id)
    )
    subjects: list[Subject] = list(subjects_result.scalars().all())

    # Rooms are shared across departments – fetch all.
    rooms_result = await db.execute(select(Room))
    rooms: list[Room] = list(rooms_result.scalars().all())

    batches_result = await db.execute(
        select(Batch).where(Batch.department_id == department_id)
    )
    batches: list[Batch] = list(batches_result.scalars().all())

    return teachers, subjects, rooms, batches


# ──────────────────────────────────────────────
# Solver Core (runs in a worker thread)
# ──────────────────────────────────────────────
def _solve(
    teachers: list[dict],
    subjects: list[dict],
    rooms: list[dict],
    batches: list[dict],
) -> dict:
    """
    Build and solve the CP-SAT model.

    Each subject dict now carries ``batch_id`` and ``teacher_id`` from the
    seed data, so we use the *actual* assigned teacher rather than a
    round-robin mapping.
    """

    teacher_map = {t["id"]: t for t in teachers}
    batch_map = {b["id"]: b for b in batches}

    if not teachers:
        return {
            "status": "INFEASIBLE",
            "reason": "No teachers found for this department.",
        }

    model = cp_model.CpModel()

    # ── decision variables ───────────────────
    # x[b_id, s_id, t_id, r_id, d_idx, p] ∈ {0, 1}
    x: dict[tuple[int, int, int, int, int, int], Any] = {}

    for s in subjects:
        b_id = s["batch_id"]
        t_id = s["teacher_id"]
        b = batch_map.get(b_id)
        if b is None:
            continue  # orphan subject row
        for r in rooms:
            if r["capacity"] < b["size"]:
                continue
            for d_idx in range(NUM_DAYS):
                for p in SLOT_INDICES:
                    key = (b_id, s["id"], t_id, r["id"], d_idx, p)
                    var_name = (
                        f"x_b{b_id}_s{s['id']}_t{t_id}"
                        f"_r{r['id']}_d{d_idx}_p{p}"
                    )
                    x[key] = model.NewBoolVar(var_name)

    if not x:
        return {
            "status": "INFEASIBLE",
            "reason": (
                "No valid variable combinations exist. "
                "Check that room capacities can accommodate batch sizes."
            ),
        }

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
            b = batch_map[b_id]
            return {
                "status": "INFEASIBLE",
                "reason": (
                    f"No room large enough for batch '{b['name']}' "
                    f"(size {b['size']}) to attend subject '{s['name']}'."
                ),
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

    # ── Solve ────────────────────────────────
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 60.0
    solver.parameters.num_workers = 4
    solver.parameters.log_search_progress = False

    logger.info("CP-SAT solver started …")
    status = solver.Solve(model)
    logger.info("CP-SAT solver finished – status=%s", solver.StatusName(status))

    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        schedule: list[dict[str, Any]] = []
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
        return {"status": "SUCCESS", "schedule": schedule}

    return {
        "status": "INFEASIBLE",
        "reason": (
            "Mathematical constraints could not be satisfied "
            "with the current rooms/teachers."
        ),
    }


# ──────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────
async def generate_schedule(
    db: AsyncSession,
    department_id: int,
) -> dict:
    """
    Generate a conflict-free weekly timetable for *department_id*,
    persist the result as ScheduleSlot rows under a new TimetableRun,
    and return a summary dict.
    """

    # Step A – fetch data
    teachers, subjects, rooms, batches = await _fetch_department_data(
        db, department_id
    )

    # Guard: need at least one of each entity
    if not teachers:
        return {
            "status": "INFEASIBLE",
            "reason": "No teachers registered for this department.",
        }
    if not subjects:
        return {
            "status": "INFEASIBLE",
            "reason": "No subjects registered for this department.",
        }
    if not rooms:
        return {
            "status": "INFEASIBLE",
            "reason": "No rooms available in the system.",
        }
    if not batches:
        return {
            "status": "INFEASIBLE",
            "reason": "No batches registered for this department.",
        }

    batch_map = {b.id: b for b in batches}

    # Validate credit load per batch
    for batch in batches:
        batch_subjects = [s for s in subjects if s.batch_id == batch.id]
        total_credits = sum(s.credits for s in batch_subjects)
        if total_credits > TOTAL_WEEKLY_PERIODS:
            return {
                "status": "INFEASIBLE",
                "reason": (
                    f"Batch '{batch.name}' requires {total_credits} "
                    f"slots but only {TOTAL_WEEKLY_PERIODS} weekly "
                    f"periods are available."
                ),
            }

    # Serialise ORM objects to plain dicts (thread-safe)
    teachers_data = [{"id": t.id, "name": t.name} for t in teachers]
    subjects_data = [
        {
            "id": s.id,
            "name": s.name,
            "credits": s.credits,
            "batch_id": s.batch_id,
            "teacher_id": s.teacher_id,
        }
        for s in subjects
        if s.batch_id is not None and s.teacher_id is not None
    ]
    rooms_data = [
        {"id": r.id, "name": r.name, "capacity": r.capacity, "is_lab": r.is_lab}
        for r in rooms
    ]
    batches_data = [
        {"id": b.id, "name": b.name, "size": b.size} for b in batches
    ]

    if not subjects_data:
        return {
            "status": "INFEASIBLE",
            "reason": (
                "No subjects with batch/teacher assignments found. "
                "Please check the seed data."
            ),
        }

    # Step B – offload CPU-heavy solve to a worker thread
    result: dict = await asyncio.to_thread(
        _solve, teachers_data, subjects_data, rooms_data, batches_data
    )

    # Step C – persist the run and schedule slots
    run = TimetableRun(
        department_id=department_id,
        solver_status=result.get("status", "UNKNOWN"),
        status=RunStatus.DRAFT if result.get("status") == "SUCCESS" else RunStatus.FAILED,
        reason=result.get("reason"),
    )
    db.add(run)
    await db.flush()  # get run.id

    if result.get("status") == "SUCCESS":
        schedule = result.get("schedule", [])
        # Delete old slots for this department (keep only latest run)
        old_run_ids_q = (
            select(TimetableRun.id)
            .where(TimetableRun.department_id == department_id)
            .where(TimetableRun.id != run.id)
        )
        await db.execute(
            delete(ScheduleSlot).where(
                ScheduleSlot.run_id.in_(old_run_ids_q)
            )
        )
        # Delete old runs
        await db.execute(
            delete(TimetableRun)
            .where(TimetableRun.department_id == department_id)
            .where(TimetableRun.id != run.id)
        )

        for entry in schedule:
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
        result["slots_created"] = len(schedule)
    else:
        await db.commit()
        result["run_id"] = run.id

    return result
