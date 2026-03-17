"""
Timetable CP-SAT Solver
========================
Production-grade constraint-programming engine that generates a
conflict-free weekly class schedule for a given department.

Uses Google OR-Tools CP-SAT to enforce hard constraints:
  1. Subject Fulfillment  – each batch meets every subject exactly `credits` times.
  2. Teacher Conflict     – a teacher appears in at most one slot per (day, period).
  3. Room Conflict        – a room is used by at most one class per (day, period).
  4. Batch Conflict       – a batch attends at most one class per (day, period).

The heavy CP-SAT solve is offloaded to a thread via ``asyncio.to_thread``
so the FastAPI event loop is never blocked.
"""

from __future__ import annotations

import asyncio
import logging
from itertools import product as cartesian
from typing import Any

from ortools.sat.python import cp_model
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.timetable import (
    Batch,
    DayOfWeek,
    Room,
    Subject,
    Teacher,
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

# Four teaching periods per day
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

    All arguments are plain dicts (serialisable) so this function carries
    no SQLAlchemy session state and is safe to run in ``asyncio.to_thread``.
    """

    # ── quick-indexes ────────────────────────
    teacher_map = {t["id"]: t for t in teachers}
    subject_map = {s["id"]: s for s in subjects}
    room_map = {r["id"]: r for r in rooms}
    batch_map = {b["id"]: b for b in batches}

    # Simple 1-teacher-per-subject mapping (round-robin assignment)
    # Maps subject_id -> teacher_id
    subject_teacher: dict[int, int] = {}
    teacher_ids = [t["id"] for t in teachers]
    if not teacher_ids:
        return {
            "status": "INFEASIBLE",
            "reason": "No teachers found for this department.",
        }
    for idx, subj in enumerate(subjects):
        subject_teacher[subj["id"]] = teacher_ids[idx % len(teacher_ids)]

    model = cp_model.CpModel()

    # ── decision variables ───────────────────
    # x[b, s, t, r, d, p] ∈ {0, 1}
    # "Batch b learns Subject s from Teacher t in Room r on Day d, Period p"
    x: dict[tuple[int, int, int, int, int, int], Any] = {}

    for b in batches:
        for s in subjects:
            t_id = subject_teacher[s["id"]]
            for r in rooms:
                # ── pre-filter: skip if room too small ──
                if r["capacity"] < b["size"]:
                    continue
                for d_idx, day in enumerate(DAYS):
                    for p in SLOT_INDICES:
                        key = (b["id"], s["id"], t_id, r["id"], d_idx, p)
                        var_name = (
                            f"x_b{b['id']}_s{s['id']}_t{t_id}"
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
    # Each (batch, subject) pair must be scheduled exactly `credits` times.
    for b in batches:
        for s in subjects:
            t_id = subject_teacher[s["id"]]
            slot_vars = [
                x[key]
                for key in x
                if key[0] == b["id"] and key[1] == s["id"] and key[2] == t_id
            ]
            if slot_vars:
                model.Add(sum(slot_vars) == s["credits"])
            else:
                # No feasible room for this batch-subject → infeasible
                return {
                    "status": "INFEASIBLE",
                    "reason": (
                        f"No room large enough for batch '{b['name']}' "
                        f"(size {b['size']}) to attend subject '{s['name']}'."
                    ),
                }

    # ── HARD CONSTRAINT 2: Teacher Conflict ──
    # A teacher teaches at most 1 class per (day, slot).
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
    # A room hosts at most 1 class per (day, slot).
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
    # A batch attends at most 1 class per (day, slot).
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
    solver.parameters.max_time_in_seconds = 60.0  # hard time-limit
    solver.parameters.num_workers = 4              # parallel search
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

        # Sort for deterministic output: batch → day → slot
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
    Generate a conflict-free weekly timetable for *department_id*.

    Returns
    -------
    dict
        ``{"status": "SUCCESS", "schedule": [...]}`` on success, or
        ``{"status": "INFEASIBLE", "reason": "..."}`` on failure.
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

    # Validate that total weekly periods can accommodate the credit load
    for batch in batches:
        total_credits = sum(s.credits for s in subjects)
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
        {"id": s.id, "name": s.name, "credits": s.credits} for s in subjects
    ]
    rooms_data = [
        {"id": r.id, "name": r.name, "capacity": r.capacity, "is_lab": r.is_lab}
        for r in rooms
    ]
    batches_data = [
        {"id": b.id, "name": b.name, "size": b.size} for b in batches
    ]

    # Step D – offload CPU-heavy solve to a worker thread
    result: dict = await asyncio.to_thread(
        _solve, teachers_data, subjects_data, rooms_data, batches_data
    )

    return result
