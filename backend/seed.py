"""
Seed loader for Atlas Smart Class Scheduler.

Reads ``pinnacle_data.json`` and populates the PostgreSQL database with
departments, batches, teachers, rooms, and subjects – respecting the FK
relationships and SmartClassScheduler domain fields.

Usage:
    # From the backend/ directory:
    python seed.py

The script is idempotent:
  * Departments, Rooms, Teachers, and Batches are looked up by (name + FK).
  * Subjects are looked up by (name + department_id + batch_id).
  * If a record already exists, it is skipped (no duplicates).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Allow running from the `backend/` directory without installing the package.
# ---------------------------------------------------------------------------
sys.path.insert(0, str(Path(__file__).resolve().parent))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_maker, engine, Base
from app.models.timetable import (
    Batch,
    Department,
    Room,
    Subject,
    Teacher,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)-5s  %(message)s")
log = logging.getLogger("seed")

DATA_FILE = Path(__file__).resolve().parent / "pinnacle_data.json"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
async def _get_or_create_department(db: AsyncSession, name: str) -> Department:
    result = await db.execute(
        select(Department).where(Department.name == name)
    )
    dept = result.scalar_one_or_none()
    if dept:
        return dept
    dept = Department(name=name)
    db.add(dept)
    await db.flush()
    log.info("  + Department: %s  (id=%d)", dept.name, dept.id)
    return dept


async def _get_or_create_room(
    db: AsyncSession, name: str, capacity: int, is_lab: bool
) -> Room:
    result = await db.execute(select(Room).where(Room.name == name))
    room = result.scalar_one_or_none()
    if room:
        return room
    room = Room(name=name, capacity=capacity, is_lab=is_lab)
    db.add(room)
    await db.flush()
    log.info("  + Room: %s  (cap=%d, lab=%s, id=%d)", room.name, capacity, is_lab, room.id)
    return room


async def _get_or_create_teacher(
    db: AsyncSession,
    name: str,
    department_id: int,
    email: str | None = None,
    preferred_start_slot: int = 0,
    preferred_end_slot: int = 8,
    max_classes_per_day: int = 4,
) -> Teacher:
    result = await db.execute(
        select(Teacher).where(
            Teacher.name == name,
            Teacher.department_id == department_id,
        )
    )
    teacher = result.scalar_one_or_none()
    if teacher:
        return teacher
    teacher = Teacher(
        name=name,
        email=email,
        department_id=department_id,
        preferred_start_slot=preferred_start_slot,
        preferred_end_slot=preferred_end_slot,
        max_classes_per_day=max_classes_per_day,
    )
    db.add(teacher)
    await db.flush()
    log.info("  + Teacher: %s  (id=%d)", teacher.name, teacher.id)
    return teacher


async def _get_or_create_batch(
    db: AsyncSession,
    name: str,
    size: int,
    department_id: int,
    parent_batch_id: int | None = None,
    max_classes_per_day: int = 6,
) -> Batch:
    result = await db.execute(
        select(Batch).where(
            Batch.name == name,
            Batch.department_id == department_id,
        )
    )
    batch = result.scalar_one_or_none()
    if batch:
        return batch
    batch = Batch(
        name=name,
        size=size,
        department_id=department_id,
        parent_batch_id=parent_batch_id,
        max_classes_per_day=max_classes_per_day,
    )
    db.add(batch)
    await db.flush()
    log.info("  + Batch: %s  (size=%d, parent=%s, id=%d)", batch.name, size, parent_batch_id, batch.id)
    return batch


async def _get_or_create_subject(
    db: AsyncSession,
    name: str,
    credits: int,
    department_id: int,
    batch_id: int | None,
    teacher_id: int | None,
    code: str | None = None,
) -> Subject:
    q = select(Subject).where(
        Subject.name == name,
        Subject.department_id == department_id,
    )
    if batch_id is not None:
        q = q.where(Subject.batch_id == batch_id)
    else:
        q = q.where(Subject.batch_id.is_(None))
    result = await db.execute(q)
    subj = result.scalar_one_or_none()
    if subj:
        return subj
    subj = Subject(
        name=name,
        code=code,
        credits=credits,
        department_id=department_id,
        batch_id=batch_id,
        teacher_id=teacher_id,
    )
    db.add(subj)
    await db.flush()
    log.info("  + Subject: %s [%s]  (batch_id=%s, teacher_id=%s, id=%d)", name, code, batch_id, teacher_id, subj.id)
    return subj


# ---------------------------------------------------------------------------
# Main seed logic
# ---------------------------------------------------------------------------
async def seed() -> None:
    if not DATA_FILE.exists():
        log.error("Seed data file not found: %s", DATA_FILE)
        return

    with open(DATA_FILE, encoding="utf-8") as f:
        records: list[dict] = json.load(f)

    # ---------------------------------------------------------------------------
    # Build lookup maps from the JSON pk → created DB id
    # ---------------------------------------------------------------------------
    dept_map: dict[int, Department] = {}
    batch_map: dict[int, Batch] = {}
    teacher_map: dict[int, Teacher] = {}
    room_map: dict[int, Room] = {}

    # Separate records by model type
    depts = [r for r in records if r["model"] == "api.department"]
    batches = [r for r in records if r["model"] == "api.studentbatch"]
    teachers = [r for r in records if r["model"] == "api.teacher"]
    rooms = [r for r in records if r["model"] == "api.room"]
    subjects = [r for r in records if r["model"] == "api.subject"]

    log.info(
        "Loaded %d records from %s  "
        "(depts=%d, batches=%d, teachers=%d, rooms=%d, subjects=%d)",
        len(records), DATA_FILE.name,
        len(depts), len(batches), len(teachers), len(rooms), len(subjects),
    )

    async with async_session_maker() as db:
        # --- 1. Departments ---
        log.info("Seeding departments...")
        for rec in depts:
            dept = await _get_or_create_department(db, rec["fields"]["name"])
            dept_map[rec["pk"]] = dept

        # --- 2. Batches (two passes: parents first, then children) ---
        log.info("Seeding batches...")
        # First pass: batches without parent_batch
        for rec in batches:
            if rec["fields"].get("parent_batch") is not None:
                continue
            json_dept_pk = rec["fields"]["department"]
            dept = dept_map.get(json_dept_pk)
            if not dept:
                log.warning("  ⚠ Batch '%s' references unknown department pk=%d – skipped", rec["fields"]["name"], json_dept_pk)
                continue
            batch = await _get_or_create_batch(
                db,
                name=rec["fields"]["name"],
                size=rec["fields"]["size"],
                department_id=dept.id,
                parent_batch_id=None,
                max_classes_per_day=rec["fields"].get("max_classes_per_day", 6),
            )
            batch_map[rec["pk"]] = batch

        # Second pass: batches with parent_batch
        for rec in batches:
            if rec["fields"].get("parent_batch") is None:
                continue
            json_dept_pk = rec["fields"]["department"]
            dept = dept_map.get(json_dept_pk)
            if not dept:
                log.warning("  ⚠ Batch '%s' references unknown department pk=%d – skipped", rec["fields"]["name"], json_dept_pk)
                continue
            parent = batch_map.get(rec["fields"]["parent_batch"])
            batch = await _get_or_create_batch(
                db,
                name=rec["fields"]["name"],
                size=rec["fields"]["size"],
                department_id=dept.id,
                parent_batch_id=parent.id if parent else None,
                max_classes_per_day=rec["fields"].get("max_classes_per_day", 6),
            )
            batch_map[rec["pk"]] = batch

        # --- 3. Teachers ---
        log.info("Seeding teachers...")
        for rec in teachers:
            json_dept_pk = rec["fields"]["department"]
            dept = dept_map.get(json_dept_pk)
            if not dept:
                log.warning("  ⚠ Teacher '%s' references unknown department pk=%d – skipped", rec["fields"]["name"], json_dept_pk)
                continue
            teacher = await _get_or_create_teacher(
                db,
                name=rec["fields"]["name"],
                department_id=dept.id,
                email=rec["fields"].get("email"),
                preferred_start_slot=rec["fields"].get("preferred_start_slot", 0),
                preferred_end_slot=rec["fields"].get("preferred_end_slot", 8),
                max_classes_per_day=rec["fields"].get("max_classes_per_day", 4),
            )
            teacher_map[rec["pk"]] = teacher

        # --- 4. Rooms ---
        log.info("Seeding rooms...")
        for rec in rooms:
            room = await _get_or_create_room(
                db,
                name=rec["fields"]["name"],
                capacity=rec["fields"]["capacity"],
                is_lab=rec["fields"].get("is_lab", False),
            )
            room_map[rec["pk"]] = room

        # --- 5. Subjects ---
        log.info("Seeding subjects...")
        for rec in subjects:
            json_dept_pk = rec["fields"]["department"]
            json_batch_pk = rec["fields"].get("batch")
            json_teacher_pk = rec["fields"].get("teacher")

            dept = dept_map.get(json_dept_pk)
            if not dept:
                log.warning("  ⚠ Subject '%s' references unknown department pk=%d – skipped", rec["fields"]["name"], json_dept_pk)
                continue

            batch = batch_map.get(json_batch_pk) if json_batch_pk else None
            teacher = teacher_map.get(json_teacher_pk) if json_teacher_pk else None

            credits = rec["fields"].get("weekly_lectures", 3)

            await _get_or_create_subject(
                db,
                name=rec["fields"]["name"],
                credits=credits,
                department_id=dept.id,
                batch_id=batch.id if batch else None,
                teacher_id=teacher.id if teacher else None,
                code=rec["fields"].get("code"),
            )

        await db.commit()
        log.info("✅ Seed complete!")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    asyncio.run(seed())
