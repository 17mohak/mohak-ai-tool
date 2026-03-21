"""
Scheduler Admin CRUD API
=========================
Full CRUD endpoints for the timetable domain: departments, batches,
teachers, subjects, rooms, pinned slots, teacher unavailability,
validation, direct generation trigger, and run management.

This is the primary admin API surface — no AI/chat required.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.database import get_db
from app.core.deps import get_current_user, DevUser
from app.models.timetable import (
    Batch,
    Department,
    DayOfWeek,
    LeaveApplication,
    PinnedSlot,
    Room,
    RunStatus,
    ScheduleSlot,
    Subject,
    Teacher,
    TeacherUnavailability,
    TimetableRun,
)

router = APIRouter(prefix="/scheduler", tags=["scheduler-admin"])

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Pydantic Schemas
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class DeptIn(BaseModel):
    name: str


class BatchIn(BaseModel):
    name: str
    size: int = 60
    max_classes_per_day: int = 6
    department_id: int
    parent_batch_id: int | None = None


class TeacherIn(BaseModel):
    name: str
    email: str | None = None
    department_id: int
    preferred_start_slot: int = 0
    preferred_end_slot: int = 8
    max_classes_per_day: int = 4


class SubjectIn(BaseModel):
    name: str
    code: str | None = None
    credits: int = 3
    department_id: int
    batch_id: int | None = None
    teacher_id: int | None = None


class RoomIn(BaseModel):
    name: str
    capacity: int = 60
    is_lab: bool = False


class PinnedSlotIn(BaseModel):
    subject_id: int
    day: str
    slot_index: int


class UnavailabilityIn(BaseModel):
    teacher_id: int
    day: str
    slot_index: int


class GenerateRequest(BaseModel):
    department_id: int


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# DEPARTMENTS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


@router.get("/departments")
async def list_departments(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """List all departments with counts."""
    result = await db.execute(select(Department).order_by(Department.name))
    departments = result.scalars().all()
    out = []
    for d in departments:
        bc = await db.execute(
            select(func.count(Batch.id)).where(Batch.department_id == d.id)
        )
        tc = await db.execute(
            select(func.count(Teacher.id)).where(Teacher.department_id == d.id)
        )
        sc = await db.execute(
            select(func.count(Subject.id)).where(Subject.department_id == d.id)
        )
        out.append(
            {
                "id": d.id,
                "name": d.name,
                "batch_count": bc.scalar() or 0,
                "teacher_count": tc.scalar() or 0,
                "subject_count": sc.scalar() or 0,
            }
        )
    return out


@router.post("/departments", status_code=201)
async def create_department(body: DeptIn, db: AsyncSession = Depends(get_db)):
    dept = Department(name=body.name)
    db.add(dept)
    await db.flush()
    return {"id": dept.id, "name": dept.name}


@router.put("/departments/{dept_id}")
async def update_department(
    dept_id: int, body: DeptIn, db: AsyncSession = Depends(get_db)
):
    dept = await _get(db, Department, dept_id)
    dept.name = body.name
    await db.flush()
    return {"id": dept.id, "name": dept.name}


@router.delete("/departments/{dept_id}")
async def delete_department(dept_id: int, db: AsyncSession = Depends(get_db)):
    dept = await _get(db, Department, dept_id)
    await db.delete(dept)
    await db.flush()
    return {"ok": True}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# BATCHES
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


@router.get("/batches")
async def list_batches(
    department_id: int | None = None, db: AsyncSession = Depends(get_db)
):
    q = select(Batch).order_by(
        Batch.department_id, Batch.parent_batch_id.is_(None).desc(), Batch.name
    )
    if department_id is not None:
        q = q.where(Batch.department_id == department_id)
    result = await db.execute(q)
    batches = result.scalars().all()
    return [
        {
            "id": b.id,
            "name": b.name,
            "size": b.size,
            "max_classes_per_day": b.max_classes_per_day,
            "department_id": b.department_id,
            "parent_batch_id": b.parent_batch_id,
            "is_lab": b.parent_batch_id is not None,
        }
        for b in batches
    ]


@router.post("/batches", status_code=201)
async def create_batch(body: BatchIn, db: AsyncSession = Depends(get_db)):
    batch = Batch(
        name=body.name,
        size=body.size,
        max_classes_per_day=body.max_classes_per_day,
        department_id=body.department_id,
        parent_batch_id=body.parent_batch_id,
    )
    db.add(batch)
    await db.flush()
    return {"id": batch.id, "name": batch.name}


@router.put("/batches/{batch_id}")
async def update_batch(
    batch_id: int, body: BatchIn, db: AsyncSession = Depends(get_db)
):
    batch = await _get(db, Batch, batch_id)
    batch.name = body.name
    batch.size = body.size
    batch.max_classes_per_day = body.max_classes_per_day
    batch.department_id = body.department_id
    batch.parent_batch_id = body.parent_batch_id
    await db.flush()
    return {"id": batch.id, "name": batch.name}


@router.delete("/batches/{batch_id}")
async def delete_batch(batch_id: int, db: AsyncSession = Depends(get_db)):
    batch = await _get(db, Batch, batch_id)
    await db.delete(batch)
    await db.flush()
    return {"ok": True}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# TEACHERS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


@router.get("/teachers")
async def list_teachers(
    department_id: int | None = None, db: AsyncSession = Depends(get_db)
):
    q = select(Teacher).order_by(Teacher.name)
    if department_id is not None:
        q = q.where(Teacher.department_id == department_id)
    result = await db.execute(q)
    teachers = result.scalars().all()
    return [
        {
            "id": t.id,
            "name": t.name,
            "email": t.email,
            "department_id": t.department_id,
            "preferred_start_slot": t.preferred_start_slot,
            "preferred_end_slot": t.preferred_end_slot,
            "max_classes_per_day": t.max_classes_per_day,
        }
        for t in teachers
    ]


@router.post("/teachers", status_code=201)
async def create_teacher(body: TeacherIn, db: AsyncSession = Depends(get_db)):
    teacher = Teacher(
        name=body.name,
        email=body.email,
        department_id=body.department_id,
        preferred_start_slot=body.preferred_start_slot,
        preferred_end_slot=body.preferred_end_slot,
        max_classes_per_day=body.max_classes_per_day,
    )
    db.add(teacher)
    await db.flush()
    return {"id": teacher.id, "name": teacher.name}


@router.put("/teachers/{teacher_id}")
async def update_teacher(
    teacher_id: int, body: TeacherIn, db: AsyncSession = Depends(get_db)
):
    teacher = await _get(db, Teacher, teacher_id)
    teacher.name = body.name
    teacher.email = body.email
    teacher.department_id = body.department_id
    teacher.preferred_start_slot = body.preferred_start_slot
    teacher.preferred_end_slot = body.preferred_end_slot
    teacher.max_classes_per_day = body.max_classes_per_day
    await db.flush()
    return {"id": teacher.id, "name": teacher.name}


@router.delete("/teachers/{teacher_id}")
async def delete_teacher(teacher_id: int, db: AsyncSession = Depends(get_db)):
    teacher = await _get(db, Teacher, teacher_id)
    await db.delete(teacher)
    await db.flush()
    return {"ok": True}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# TEACHER UNAVAILABILITY
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


@router.get("/unavailability")
async def list_unavailability(
    teacher_id: int | None = None,
    department_id: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    q = select(TeacherUnavailability).options(joinedload(TeacherUnavailability.teacher))
    if teacher_id is not None:
        q = q.where(TeacherUnavailability.teacher_id == teacher_id)
    if department_id is not None:
        q = q.join(Teacher, TeacherUnavailability.teacher_id == Teacher.id).where(
            Teacher.department_id == department_id
        )
    result = await db.execute(q)
    rows = result.scalars().all()
    return [
        {
            "id": r.id,
            "teacher_id": r.teacher_id,
            "teacher_name": r.teacher.name if r.teacher else "",
            "day": r.day.value,
            "slot_index": r.slot_index,
        }
        for r in rows
    ]


@router.post("/unavailability", status_code=201)
async def create_unavailability(
    body: UnavailabilityIn, db: AsyncSession = Depends(get_db)
):
    row = TeacherUnavailability(
        teacher_id=body.teacher_id,
        day=DayOfWeek(body.day),
        slot_index=body.slot_index,
    )
    db.add(row)
    await db.flush()
    return {"id": row.id}


@router.delete("/unavailability/{row_id}")
async def delete_unavailability(row_id: int, db: AsyncSession = Depends(get_db)):
    row = await _get(db, TeacherUnavailability, row_id)
    await db.delete(row)
    await db.flush()
    return {"ok": True}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SUBJECTS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


@router.get("/subjects")
async def list_subjects(
    department_id: int | None = None,
    batch_id: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    q = select(Subject).order_by(Subject.name)
    if department_id is not None:
        q = q.where(Subject.department_id == department_id)
    if batch_id is not None:
        q = q.where(Subject.batch_id == batch_id)
    result = await db.execute(q)
    subjects = result.scalars().all()

    # Bulk-fetch batch and teacher names for display
    batch_ids = {s.batch_id for s in subjects if s.batch_id}
    teacher_ids = {s.teacher_id for s in subjects if s.teacher_id}
    dept_ids = {s.department_id for s in subjects}

    batches_map = {}
    if batch_ids:
        br = await db.execute(select(Batch).where(Batch.id.in_(batch_ids)))
        batches_map = {b.id: b.name for b in br.scalars().all()}

    teachers_map = {}
    if teacher_ids:
        tr = await db.execute(select(Teacher).where(Teacher.id.in_(teacher_ids)))
        teachers_map = {t.id: t.name for t in tr.scalars().all()}

    depts_map = {}
    if dept_ids:
        dr = await db.execute(select(Department).where(Department.id.in_(dept_ids)))
        depts_map = {d.id: d.name for d in dr.scalars().all()}

    return [
        {
            "id": s.id,
            "name": s.name,
            "code": s.code,
            "credits": s.credits,
            "department_id": s.department_id,
            "department_name": depts_map.get(s.department_id, ""),
            "batch_id": s.batch_id,
            "batch_name": batches_map.get(s.batch_id) if s.batch_id else "",
            "teacher_id": s.teacher_id,
            "teacher_name": teachers_map.get(s.teacher_id) if s.teacher_id else "",
        }
        for s in subjects
    ]


@router.post("/subjects", status_code=201)
async def create_subject(body: SubjectIn, db: AsyncSession = Depends(get_db)):
    subj = Subject(
        name=body.name,
        code=body.code,
        credits=body.credits,
        department_id=body.department_id,
        batch_id=body.batch_id,
        teacher_id=body.teacher_id,
    )
    db.add(subj)
    await db.flush()
    return {"id": subj.id, "name": subj.name}


@router.put("/subjects/{subject_id}")
async def update_subject(
    subject_id: int, body: SubjectIn, db: AsyncSession = Depends(get_db)
):
    subj = await _get(db, Subject, subject_id)
    subj.name = body.name
    subj.code = body.code
    subj.credits = body.credits
    subj.department_id = body.department_id
    subj.batch_id = body.batch_id
    subj.teacher_id = body.teacher_id
    await db.flush()
    return {"id": subj.id, "name": subj.name}


@router.delete("/subjects/{subject_id}")
async def delete_subject(subject_id: int, db: AsyncSession = Depends(get_db)):
    subj = await _get(db, Subject, subject_id)
    await db.delete(subj)
    await db.flush()
    return {"ok": True}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ROOMS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


@router.get("/rooms")
async def list_rooms(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Room).order_by(Room.name))
    rooms = result.scalars().all()
    return [
        {
            "id": r.id,
            "name": r.name,
            "capacity": r.capacity,
            "is_lab": r.is_lab,
        }
        for r in rooms
    ]


@router.post("/rooms", status_code=201)
async def create_room(body: RoomIn, db: AsyncSession = Depends(get_db)):
    room = Room(name=body.name, capacity=body.capacity, is_lab=body.is_lab)
    db.add(room)
    await db.flush()
    return {"id": room.id, "name": room.name}


@router.put("/rooms/{room_id}")
async def update_room(room_id: int, body: RoomIn, db: AsyncSession = Depends(get_db)):
    room = await _get(db, Room, room_id)
    room.name = body.name
    room.capacity = body.capacity
    room.is_lab = body.is_lab
    await db.flush()
    return {"id": room.id, "name": room.name}


@router.delete("/rooms/{room_id}")
async def delete_room(room_id: int, db: AsyncSession = Depends(get_db)):
    room = await _get(db, Room, room_id)
    await db.delete(room)
    await db.flush()
    return {"ok": True}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PINNED SLOTS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


@router.get("/pinned-slots")
async def list_pinned_slots(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PinnedSlot)
        .options(joinedload(PinnedSlot.subject))
        .order_by(PinnedSlot.day, PinnedSlot.slot_index)
    )
    pins = result.scalars().all()
    return [
        {
            "id": p.id,
            "subject_id": p.subject_id,
            "subject_name": p.subject.name if p.subject else "",
            "day": p.day.value,
            "slot_index": p.slot_index,
        }
        for p in pins
    ]


@router.post("/pinned-slots", status_code=201)
async def create_pinned_slot(body: PinnedSlotIn, db: AsyncSession = Depends(get_db)):
    pin = PinnedSlot(
        subject_id=body.subject_id,
        day=DayOfWeek(body.day),
        slot_index=body.slot_index,
    )
    db.add(pin)
    await db.flush()
    return {"id": pin.id}


@router.delete("/pinned-slots/{pin_id}")
async def delete_pinned_slot(pin_id: int, db: AsyncSession = Depends(get_db)):
    pin = await _get(db, PinnedSlot, pin_id)
    await db.delete(pin)
    await db.flush()
    return {"ok": True}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# VALIDATION
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SLOT_LABELS = [
    {"index": 0, "label": "09:00 – 10:30"},
    {"index": 1, "label": "11:00 – 12:30"},
    {"index": 2, "label": "14:00 – 15:30"},
    {"index": 3, "label": "16:00 – 17:30"},
]
TOTAL_WEEKLY_PERIODS = 5 * len(SLOT_LABELS)  # 20


@router.post("/validate/{dept_id}")
async def validate_department(dept_id: int, db: AsyncSession = Depends(get_db)):
    """Pre-generation diagnostic checks for a department."""
    dept = await _get(db, Department, dept_id)
    warnings: list[dict] = []
    errors: list[dict] = []

    # Batches
    br = await db.execute(select(Batch).where(Batch.department_id == dept_id))
    batches = br.scalars().all()
    if not batches:
        errors.append(
            {"type": "no_batches", "message": f"No batches found for {dept.name}."}
        )

    # Teachers
    tr = await db.execute(select(Teacher).where(Teacher.department_id == dept_id))
    teachers = tr.scalars().all()
    if not teachers:
        errors.append(
            {"type": "no_teachers", "message": f"No teachers found for {dept.name}."}
        )

    # Subjects
    sr = await db.execute(select(Subject).where(Subject.department_id == dept_id))
    subjects = sr.scalars().all()
    if not subjects:
        errors.append(
            {"type": "no_subjects", "message": f"No subjects found for {dept.name}."}
        )

    # Rooms
    rr = await db.execute(select(Room))
    rooms = rr.scalars().all()
    if not rooms:
        errors.append({"type": "no_rooms", "message": "No rooms exist in the system."})

    # Check credit load per batch
    for batch in batches:
        batch_subjects = [s for s in subjects if s.batch_id == batch.id]
        total_credits = sum(s.credits for s in batch_subjects)
        if total_credits > TOTAL_WEEKLY_PERIODS:
            errors.append(
                {
                    "type": "overloaded_batch",
                    "message": (
                        f"Batch '{batch.name}' requires {total_credits} weekly slots "
                        f"but only {TOTAL_WEEKLY_PERIODS} periods are available."
                    ),
                }
            )
        elif total_credits == 0:
            warnings.append(
                {
                    "type": "empty_batch",
                    "message": f"Batch '{batch.name}' has no subjects assigned.",
                }
            )

    # Subjects without teacher or batch assignment
    unassigned = [s for s in subjects if s.batch_id is None or s.teacher_id is None]
    if unassigned:
        warnings.append(
            {
                "type": "unassigned_subjects",
                "message": f"{len(unassigned)} subject(s) have no batch or teacher assigned.",
            }
        )

    # Room capacity check
    for batch in batches:
        suitable_rooms = [r for r in rooms if r.capacity >= batch.size]
        if not suitable_rooms:
            errors.append(
                {
                    "type": "no_suitable_room",
                    "message": (
                        f"No room has capacity >= {batch.size} for batch '{batch.name}'."
                    ),
                }
            )

    can_generate = len(errors) == 0

    return {
        "department": dept.name,
        "department_id": dept.id,
        "can_generate": can_generate,
        "errors": errors,
        "warnings": warnings,
        "summary": {
            "batches": len(batches),
            "teachers": len(teachers),
            "subjects": len(subjects),
            "rooms": len(rooms),
        },
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# GENERATE (direct, no AI)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


@router.post("/generate/{dept_id}")
async def generate_timetable(dept_id: int, db: AsyncSession = Depends(get_db)):
    """Trigger timetable generation for a department directly (no AI)."""
    dept = await _get(db, Department, dept_id)

    from app.modules.timetable_ai.solver import generate_schedule
    from app.api.telemetry import broadcast

    # Batches info for telemetry
    br = await db.execute(select(Batch).where(Batch.department_id == dept_id))
    batches = br.scalars().all()

    await broadcast.broadcast(
        {
            "type": "task_log",
            "agent_id": 999,
            "agent_name": "Timetable AI",
            "task_description": f"Generating schedule for {dept.name} ({len(batches)} batches)",
            "task_status": "Running",
        }
    )

    result = await generate_schedule(db, dept.id)

    is_success = result.get("status") == "SUCCESS"
    await broadcast.broadcast(
        {
            "type": "task_log",
            "agent_id": 999,
            "agent_name": "Timetable AI",
            "task_description": f"Schedule for {dept.name}: {result.get('status')}",
            "task_status": "Success" if is_success else "Failed",
        }
    )

    return result


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# TIMETABLE RUNS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


@router.get("/runs")
async def list_runs(
    department_id: int | None = None, db: AsyncSession = Depends(get_db)
):
    q = (
        select(TimetableRun)
        .options(joinedload(TimetableRun.department))
        .order_by(TimetableRun.created_at.desc())
    )
    if department_id is not None:
        q = q.where(TimetableRun.department_id == department_id)
    result = await db.execute(q)
    runs = result.scalars().all()
    return [
        {
            "id": r.id,
            "department_id": r.department_id,
            "department_name": r.department.name if r.department else "",
            "variant_number": r.variant_number,
            "variant_label": f"V{r.variant_number}" if r.variant_number else None,
            "status": r.status.value,
            "solver_status": r.solver_status,
            "reason": r.reason,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in runs
    ]


@router.post("/runs/{run_id}/publish")
async def publish_run(run_id: int, db: AsyncSession = Depends(get_db)):
    run = await _get(db, TimetableRun, run_id)
    if run.status != RunStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Run is '{run.status.value}', not DRAFT.",
        )
    run.status = RunStatus.PUBLISHED
    await db.flush()
    return {"ok": True, "run_id": run.id, "status": "PUBLISHED"}


@router.delete("/runs/{run_id}")
async def delete_run(run_id: int, db: AsyncSession = Depends(get_db)):
    run = await _get(db, TimetableRun, run_id)
    await db.delete(run)
    await db.flush()
    return {"ok": True}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# DEPARTMENT STATE (name-based)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


async def _resolve_dept(db: AsyncSession, name: str) -> Department:
    """Case-insensitive department lookup by name."""
    result = await db.execute(
        select(Department).where(func.lower(Department.name) == name.lower())
    )
    dept = result.scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=404, detail=f"Department '{name}' not found.")
    return dept


@router.get("/state/{dept_name}")
async def get_department_state(
    dept_name: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Return all config data for a department in one call."""
    dept = await _resolve_dept(db, dept_name)
    did = dept.id

    br = await db.execute(
        select(Batch).where(Batch.department_id == did).order_by(Batch.name)
    )
    batches = br.scalars().all()

    tr = await db.execute(
        select(Teacher).where(Teacher.department_id == did).order_by(Teacher.name)
    )
    teachers = tr.scalars().all()

    sr = await db.execute(
        select(Subject).where(Subject.department_id == did).order_by(Subject.name)
    )
    subjects = sr.scalars().all()

    # Fetch all rooms
    rooms_r = await db.execute(select(Room).order_by(Room.name))
    rooms = rooms_r.scalars().all()

    batch_map = {b.id: b.name for b in batches}
    teacher_map = {t.id: t.name for t in teachers}

    pr = await db.execute(
        select(PinnedSlot)
        .options(joinedload(PinnedSlot.subject))
        .where(
            PinnedSlot.subject_id.in_([s.id for s in subjects])
            if subjects
            else PinnedSlot.id < 0
        )
    )
    pins = pr.scalars().all()

    rr = await db.execute(
        select(TimetableRun)
        .where(TimetableRun.department_id == did)
        .order_by(TimetableRun.created_at.desc())
    )
    runs = rr.scalars().all()

    # Teacher unavailabilities for the department
    teacher_ids = [t.id for t in teachers]
    ur = await db.execute(
        select(TeacherUnavailability)
        .options(joinedload(TeacherUnavailability.teacher))
        .where(
            TeacherUnavailability.teacher_id.in_(teacher_ids)
            if teacher_ids
            else TeacherUnavailability.id < 0
        )
    )
    unavailabilities = ur.scalars().all()

    # Leave applications for the department
    lr = await db.execute(
        select(LeaveApplication)
        .options(joinedload(LeaveApplication.teacher))
        .where(
            LeaveApplication.teacher_id.in_(teacher_ids)
            if teacher_ids
            else LeaveApplication.id < 0
        )
    )
    leave_applications = lr.scalars().all()

    return {
        "department": {"id": dept.id, "name": dept.name},
        "batches": [
            {
                "id": b.id,
                "name": b.name,
                "size": b.size,
                "parent_batch_id": b.parent_batch_id,
                "is_lab": b.parent_batch_id is not None,
                "max_classes_per_day": b.max_classes_per_day,
            }
            for b in batches
        ],
        "teachers": [
            {
                "id": t.id,
                "name": t.name,
                "email": t.email,
                "preferred_start_slot": t.preferred_start_slot,
                "preferred_end_slot": t.preferred_end_slot,
                "max_classes_per_day": t.max_classes_per_day,
            }
            for t in teachers
        ],
        "subjects": [
            {
                "id": s.id,
                "name": s.name,
                "code": s.code,
                "credits": s.credits,
                "batch_id": s.batch_id,
                "batch_name": batch_map.get(s.batch_id) if s.batch_id else "",
                "teacher_id": s.teacher_id,
                "teacher_name": teacher_map.get(s.teacher_id) if s.teacher_id else "",
            }
            for s in subjects
        ],
        "rooms": [
            {"id": r.id, "name": r.name, "capacity": r.capacity, "is_lab": r.is_lab}
            for r in rooms
        ],
        "pinned_slots": [
            {
                "id": p.id,
                "subject_id": p.subject_id,
                "subject_name": p.subject.name if p.subject else "",
                "day": p.day.value,
                "slot_index": p.slot_index,
            }
            for p in pins
        ],
        "unavailabilities": [
            {
                "id": u.id,
                "teacher_id": u.teacher_id,
                "teacher_name": u.teacher.name if u.teacher else "",
                "day": u.day.value,
                "slot_index": u.slot_index,
            }
            for u in unavailabilities
        ],
        "leave_applications": [
            {
                "id": la.id,
                "teacher_id": la.teacher_id,
                "teacher_name": la.teacher.name if la.teacher else "",
                "start_date": la.start_date.isoformat() if la.start_date else None,
                "end_date": la.end_date.isoformat() if la.end_date else None,
                "reason": la.reason,
                "status": la.status,
            }
            for la in leave_applications
        ],
        "runs": [
            {
                "id": r.id,
                "variant_number": r.variant_number,
                "variant_label": f"V{r.variant_number}" if r.variant_number else None,
                "status": r.status.value,
                "solver_status": r.solver_status,
                "reason": r.reason,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in runs
        ],
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# GENERATE 3 VARIANTS (name-based)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


@router.post("/generate-variants/{dept_name}")
async def generate_variants(
    dept_name: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Generate 3 timetable variants for a department (by name).

    Run lifecycle:
    1. Call generate_schedule 3 times with unique variant_id and random_seed.
    2. Old DRAFT runs are preserved (NOT deleted).
    3. Each successful run is persisted independently with variant_number.
    4. Exactly 3 new runs will exist after generation.
    5. Variants are guaranteed different via random seeding.
    """
    dept = await _resolve_dept(db, dept_name)

    from app.modules.timetable_ai.solver import generate_schedule
    from app.api.telemetry import broadcast
    import random

    # Base seed for this generation batch
    base_seed = random.randint(1, 1000000)

    # Generate 3 variants - do NOT delete old runs
    results = []
    for i in range(3):
        variant_id = i + 1
        label = f"V{variant_id}"
        # Different random seed for each variant to ensure different solutions
        random_seed = base_seed + variant_id * 1000

        await broadcast.broadcast(
            {
                "type": "task_log",
                "agent_id": 999,
                "agent_name": "Timetable AI",
                "task_description": f"Generating {label} for {dept.name} (seed: {random_seed})",
                "task_status": "Running",
            }
        )
        res = await generate_schedule(
            db, dept.id, variant_id=variant_id, random_seed=random_seed
        )
        res["variant"] = label
        res["random_seed"] = random_seed
        results.append(res)

    success_count = sum(1 for r in results if r.get("status") == "SUCCESS")
    await broadcast.broadcast(
        {
            "type": "task_log",
            "agent_id": 999,
            "agent_name": "Timetable AI",
            "task_description": f"Generated {success_count}/3 variants for {dept.name}",
            "task_status": "Success" if success_count > 0 else "Failed",
        }
    )
    return {"variants": results}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# RUN SLOTS (schedule data for a specific run)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


@router.get("/runs/{run_id}/slots")
async def get_run_slots(
    run_id: int,
    batch_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Return all schedule slots for a run, optionally filtered by batch."""
    run = await _get(db, TimetableRun, run_id)
    q = (
        select(ScheduleSlot)
        .options(
            joinedload(ScheduleSlot.subject),
            joinedload(ScheduleSlot.teacher),
            joinedload(ScheduleSlot.room),
            joinedload(ScheduleSlot.batch),
        )
        .where(ScheduleSlot.run_id == run_id)
    )
    if batch_id is not None:
        q = q.where(ScheduleSlot.batch_id == batch_id)
    result = await db.execute(q)
    slots = result.scalars().all()
    return [
        {
            "id": s.id,
            "day": s.day.value,
            "slot_index": s.slot_index,
            "subject": s.subject.name if s.subject else "",
            "teacher": s.teacher.name if s.teacher else "",
            "room": s.room.name if s.room else "",
            "batch": s.batch.name if s.batch else "",
            "batch_id": s.batch_id,
            "is_lab": s.batch.parent_batch_id is not None if s.batch else False,
        }
        for s in slots
    ]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SLOTS (with filters)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


@router.get("/slots")
async def list_slots(
    department_id: int | None = None,
    batch_id: int | None = None,
    teacher_id: int | None = None,
    run_id: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Return schedule slots with optional filters.

    Filters:
    - department_id: Filter by department (requires joining through batches)
    - batch_id: Filter by specific batch
    - teacher_id: Filter by specific teacher
    - run_id: Filter by specific timetable run
    """
    q = select(ScheduleSlot).options(
        joinedload(ScheduleSlot.subject),
        joinedload(ScheduleSlot.teacher),
        joinedload(ScheduleSlot.room),
        joinedload(ScheduleSlot.batch),
    )

    if run_id is not None:
        q = q.where(ScheduleSlot.run_id == run_id)

    if batch_id is not None:
        q = q.where(ScheduleSlot.batch_id == batch_id)

    if teacher_id is not None:
        q = q.where(ScheduleSlot.teacher_id == teacher_id)

    if department_id is not None:
        # Join with batches to filter by department
        q = q.join(Batch, ScheduleSlot.batch_id == Batch.id).where(
            Batch.department_id == department_id
        )

    q = q.order_by(ScheduleSlot.day, ScheduleSlot.slot_index)
    result = await db.execute(q)
    slots = result.scalars().all()

    return [
        {
            "id": s.id,
            "run_id": s.run_id,
            "day": s.day.value,
            "slot_index": s.slot_index,
            "subject": s.subject.name if s.subject else "",
            "subject_id": s.subject_id,
            "teacher": s.teacher.name if s.teacher else "",
            "teacher_id": s.teacher_id,
            "room": s.room.name if s.room else "",
            "room_id": s.room_id,
            "batch": s.batch.name if s.batch else "",
            "batch_id": s.batch_id,
            "is_lab": s.batch.parent_batch_id is not None if s.batch else False,
        }
        for s in slots
    ]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# LEAVE APPLICATIONS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class LeaveApplicationIn(BaseModel):
    teacher_id: int
    start_date: str
    end_date: str
    reason: str | None = None
    status: str = "PENDING"


@router.get("/leave-applications")
async def list_leave_applications(
    teacher_id: int | None = None,
    department_id: int | None = None,
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """List leave applications with optional filters."""
    q = select(LeaveApplication).options(joinedload(LeaveApplication.teacher))

    if teacher_id is not None:
        q = q.where(LeaveApplication.teacher_id == teacher_id)

    if department_id is not None:
        q = q.join(Teacher, LeaveApplication.teacher_id == Teacher.id).where(
            Teacher.department_id == department_id
        )

    if status is not None:
        q = q.where(LeaveApplication.status == status)

    q = q.order_by(LeaveApplication.created_at.desc())
    result = await db.execute(q)
    rows = result.scalars().all()

    return [
        {
            "id": r.id,
            "teacher_id": r.teacher_id,
            "teacher_name": r.teacher.name if r.teacher else "",
            "start_date": r.start_date.isoformat() if r.start_date else None,
            "end_date": r.end_date.isoformat() if r.end_date else None,
            "reason": r.reason,
            "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.post("/leave-applications", status_code=201)
async def create_leave_application(
    body: LeaveApplicationIn, db: AsyncSession = Depends(get_db)
):
    """Create a new leave application."""
    from datetime import datetime

    # Validate teacher exists
    teacher = await _get(db, Teacher, body.teacher_id)

    try:
        start_date = datetime.fromisoformat(body.start_date.replace("Z", "+00:00"))
        end_date = datetime.fromisoformat(body.end_date.replace("Z", "+00:00"))
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid date format: {str(e)}",
        )

    la = LeaveApplication(
        teacher_id=body.teacher_id,
        start_date=start_date,
        end_date=end_date,
        reason=body.reason,
        status=body.status,
    )
    db.add(la)
    await db.flush()
    return {
        "id": la.id,
        "teacher_id": la.teacher_id,
        "teacher_name": teacher.name,
        "start_date": la.start_date.isoformat() if la.start_date else None,
        "end_date": la.end_date.isoformat() if la.end_date else None,
        "reason": la.reason,
        "status": la.status,
    }


@router.put("/leave-applications/{app_id}")
async def update_leave_application(
    app_id: int, body: LeaveApplicationIn, db: AsyncSession = Depends(get_db)
):
    """Update a leave application."""
    from datetime import datetime

    la = await _get(db, LeaveApplication, app_id)

    # Validate teacher exists if changed
    if body.teacher_id != la.teacher_id:
        teacher = await _get(db, Teacher, body.teacher_id)
    else:
        teacher = la.teacher

    try:
        la.start_date = datetime.fromisoformat(body.start_date.replace("Z", "+00:00"))
        la.end_date = datetime.fromisoformat(body.end_date.replace("Z", "+00:00"))
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid date format: {str(e)}",
        )

    la.teacher_id = body.teacher_id
    la.reason = body.reason
    la.status = body.status
    await db.flush()

    return {
        "id": la.id,
        "teacher_id": la.teacher_id,
        "teacher_name": teacher.name if teacher else "",
        "start_date": la.start_date.isoformat() if la.start_date else None,
        "end_date": la.end_date.isoformat() if la.end_date else None,
        "reason": la.reason,
        "status": la.status,
    }


@router.delete("/leave-applications/{app_id}")
async def delete_leave_application(app_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a leave application."""
    la = await _get(db, LeaveApplication, app_id)
    await db.delete(la)
    await db.flush()
    return {"ok": True}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# HELPER
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


async def _get(db: AsyncSession, model, pk: int):
    obj = await db.get(model, pk)
    if not obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{model.__name__} {pk} not found.",
        )
    return obj


@router.post("/leave-applications/{app_id}/approve")
async def approve_leave_application(
    app_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Approve a leave application (Admin only)."""
    la = await _get(db, LeaveApplication, app_id)

    if la.status != "PENDING":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Leave application is already {la.status.lower()}",
        )

    la.status = "APPROVED"
    await db.flush()

    return {
        "message": "Leave application approved successfully",
        "id": la.id,
        "teacher_id": la.teacher_id,
        "teacher_name": la.teacher.name if la.teacher else "",
        "start_date": la.start_date.isoformat() if la.start_date else None,
        "end_date": la.end_date.isoformat() if la.end_date else None,
        "status": la.status,
    }


@router.post("/leave-applications/{app_id}/reject")
async def reject_leave_application(
    app_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Reject a leave application (Admin only)."""
    la = await _get(db, LeaveApplication, app_id)

    if la.status != "PENDING":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Leave application is already {la.status.lower()}",
        )

    la.status = "REJECTED"
    await db.flush()

    return {
        "message": "Leave application rejected successfully",
        "id": la.id,
        "teacher_id": la.teacher_id,
        "teacher_name": la.teacher.name if la.teacher else "",
        "start_date": la.start_date.isoformat() if la.start_date else None,
        "end_date": la.end_date.isoformat() if la.end_date else None,
        "status": la.status,
    }


# Include slot manipulation router
from app.api import slots as slots_module

router.include_router(slots_module.router)
