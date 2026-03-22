from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import joinedload

from app.core.database import get_db
from app.models.timetable import (
    Batch,
    Department,
    RunStatus,
    ScheduleSlot,
    TimetableRun,
)

router = APIRouter(prefix="/timetable", tags=["timetable"])

# Fixed slot map matching the solver constants
SLOT_MAP = {
    0: {"start": "09:00", "end": "10:30", "label": "09:00 – 10:30"},
    1: {"start": "11:00", "end": "12:30", "label": "11:00 – 12:30"},
    2: {"start": "14:00", "end": "15:30", "label": "14:00 – 15:30"},
    3: {"start": "16:00", "end": "17:30", "label": "16:00 – 17:30"},
}


@router.get("/departments")
async def get_departments(db: AsyncSession = Depends(get_db)):
    """List all departments with their batch counts."""
    result = await db.execute(select(Department).order_by(Department.name))
    departments = result.scalars().all()

    dept_list = []
    for d in departments:
        batch_result = await db.execute(
            select(func.count(Batch.id)).where(Batch.department_id == d.id)
        )
        batch_count = batch_result.scalar() or 0
        dept_list.append({
            "id": d.id,
            "name": d.name,
            "batch_count": batch_count,
        })
    return dept_list


@router.get("/departments/{dept_name}/batches")
async def get_department_batches(
    dept_name: str,
    db: AsyncSession = Depends(get_db),
):
    """List batches under a department (by name, case-insensitive)."""
    dept = await _resolve_dept(db, dept_name)
    result = await db.execute(
        select(Batch)
        .where(Batch.department_id == dept.id)
        .order_by(Batch.name)
    )
    batches = result.scalars().all()
    return [{"id": b.id, "name": b.name, "size": b.size} for b in batches]


@router.get("/schedule/{dept_name}")
async def get_department_schedule(
    dept_name: str,
    db: AsyncSession = Depends(get_db),
):
    """Fetch the latest generated timetable for a department (by name).

    Returns a denormalized list with human-readable names and times.
    """
    dept = await _resolve_dept(db, dept_name)

    # Find the latest run for this department
    run_q = await db.execute(
        select(TimetableRun)
        .where(TimetableRun.department_id == dept.id)
        .order_by(TimetableRun.created_at.desc())
        .limit(1)
    )
    run = run_q.scalar_one_or_none()

    if not run:
        return {
            "department": dept.name,
            "run": None,
            "slots": [],
            "message": "No timetable has been generated yet. Use the AI Manager to generate one.",
        }

    # Fetch slots with eager-loaded relations
    slots_q = await db.execute(
        select(ScheduleSlot)
        .where(ScheduleSlot.run_id == run.id)
        .options(
            joinedload(ScheduleSlot.subject),
            joinedload(ScheduleSlot.teacher),
            joinedload(ScheduleSlot.room),
            joinedload(ScheduleSlot.batch),
        )
    )
    slots = slots_q.scalars().all()

    formatted = []
    for slot in slots:
        time_info = SLOT_MAP.get(slot.slot_index, {})
        formatted.append({
            "id": slot.id,
            "batch": slot.batch.name if slot.batch else "—",
            "subject": slot.subject.name if slot.subject else "—",
            "teacher": slot.teacher.name if slot.teacher else "—",
            "room": slot.room.name if slot.room else "—",
            "day": slot.day.value if hasattr(slot.day, "value") else slot.day,
            "slot_index": slot.slot_index,
            "start_time": time_info.get("start", ""),
            "end_time": time_info.get("end", ""),
            "time_label": time_info.get("label", ""),
        })

    return {
        "department": dept.name,
        "run": {
            "id": run.id,
            "status": run.status.value,
            "solver_status": run.solver_status,
            "created_at": run.created_at.isoformat() if run.created_at else None,
        },
        "slots": formatted,
    }


@router.post("/schedule/{dept_name}/publish")
async def publish_schedule(
    dept_name: str,
    db: AsyncSession = Depends(get_db),
):
    """Publish the latest draft timetable for a department."""
    dept = await _resolve_dept(db, dept_name)

    run_q = await db.execute(
        select(TimetableRun)
        .where(TimetableRun.department_id == dept.id)
        .where(TimetableRun.status == RunStatus.DRAFT)
        .order_by(TimetableRun.created_at.desc())
        .limit(1)
    )
    run = run_q.scalar_one_or_none()

    if not run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No draft timetable found for {dept.name}.",
        )

    run.status = RunStatus.PUBLISHED
    await db.commit()
    return {"message": f"Timetable for {dept.name} published successfully.", "run_id": run.id}


from pydantic import BaseModel

class MoveSlotRequest(BaseModel):
    slot_id: int
    new_day: str
    new_slot_index: int

@router.post("/schedule/{dept_name}/move")
async def move_schedule_slot(
    dept_name: str,
    payload: MoveSlotRequest,
    db: AsyncSession = Depends(get_db),
):
    """Move an existing slot and validate constraints (batch overlap, teacher clash)."""
    dept = await _resolve_dept(db, dept_name)

    # Fetch the target slot
    slot_q = await db.execute(
        select(ScheduleSlot)
        .where(ScheduleSlot.id == payload.slot_id)
        .options(
            joinedload(ScheduleSlot.batch),
            joinedload(ScheduleSlot.teacher)
        )
    )
    slot = slot_q.scalar_one_or_none()
    
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found.")
        
    run_id = slot.run_id

    # Check for Teacher Overlap
    if slot.teacher_id:
        teacher_clash_q = await db.execute(
            select(ScheduleSlot).where(
                ScheduleSlot.run_id == run_id,
                ScheduleSlot.teacher_id == slot.teacher_id,
                ScheduleSlot.day == payload.new_day,
                ScheduleSlot.slot_index == payload.new_slot_index,
                ScheduleSlot.id != slot.id
            )
        )
        if teacher_clash_q.scalar_one_or_none():
            raise HTTPException(
                status_code=409, 
                detail=f"Faculty {slot.teacher.name if slot.teacher else 'Unknown'} is already teaching at this time."
            )

    # Check for Batch Overlap
    if slot.batch_id:
        batch_clash_q = await db.execute(
            select(ScheduleSlot).where(
                ScheduleSlot.run_id == run_id,
                ScheduleSlot.batch_id == slot.batch_id,
                ScheduleSlot.day == payload.new_day,
                ScheduleSlot.slot_index == payload.new_slot_index,
                ScheduleSlot.id != slot.id
            )
        )
        if batch_clash_q.scalar_one_or_none():
            raise HTTPException(
                status_code=409, 
                detail=f"Batch {slot.batch.name if slot.batch else 'Unknown'} already has a class scheduled at this time."
            )
            
    # Check for Room Overlap
    if slot.room_id:
        room_clash_q = await db.execute(
            select(ScheduleSlot).where(
                ScheduleSlot.run_id == run_id,
                ScheduleSlot.room_id == slot.room_id,
                ScheduleSlot.day == payload.new_day,
                ScheduleSlot.slot_index == payload.new_slot_index,
                ScheduleSlot.id != slot.id
            )
        )
        if room_clash_q.scalar_one_or_none():
            raise HTTPException(
                status_code=409, 
                detail="The allocated room is currently occupied by another batch during this slot."
            )

    # Apply Move
    slot.day = payload.new_day
    slot.slot_index = payload.new_slot_index
    await db.commit()
    
    return {"message": "Slot moved successfully", "slot_id": slot.id, "new_day": slot.day, "new_slot_index": slot.slot_index}

class AllocateSlotRequest(BaseModel):
    subject_id: int
    day: str
    slot_index: int
    run_id: int

@router.post("/schedule/{dept_name}/allocate")
async def allocate_schedule_slot(
    dept_name: str,
    payload: AllocateSlotRequest,
    db: AsyncSession = Depends(get_db),
):
    """Allocate a new slot for an unassigned subject, checking all constraints."""
    dept = await _resolve_dept(db, dept_name)
    
    # Resolve the subject
    from app.models.timetable import Subject
    subject_q = await db.execute(select(Subject).where(Subject.id == payload.subject_id))
    subject = subject_q.scalar_one_or_none()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    run_id = payload.run_id

    # Check for Teacher Overlap
    if subject.teacher_id:
        teacher_clash_q = await db.execute(
            select(ScheduleSlot).where(
                ScheduleSlot.run_id == run_id,
                ScheduleSlot.teacher_id == subject.teacher_id,
                ScheduleSlot.day == payload.day,
                ScheduleSlot.slot_index == payload.slot_index
            )
        )
        if teacher_clash_q.scalar_one_or_none():
            raise HTTPException(
                status_code=409, 
                detail="Faculty is already teaching at this time."
            )

    # Check for Batch Overlap
    if subject.batch_id:
        batch_clash_q = await db.execute(
            select(ScheduleSlot).where(
                ScheduleSlot.run_id == run_id,
                ScheduleSlot.batch_id == subject.batch_id,
                ScheduleSlot.day == payload.day,
                ScheduleSlot.slot_index == payload.slot_index
            )
        )
        if batch_clash_q.scalar_one_or_none():
            raise HTTPException(
                status_code=409, 
                detail="Batch already has a class scheduled at this time."
            )
            
    # Add new slot
    new_slot = ScheduleSlot(
        run_id=run_id,
        subject_id=subject.id,
        teacher_id=subject.teacher_id,
        batch_id=subject.batch_id,
        day=payload.day,
        slot_index=payload.slot_index,
        is_lab=False, # Basic allocation defaults to lecture, unless specified
        room_id=None
    )
    db.add(new_slot)
    await db.commit()
    await db.refresh(new_slot)

    return {"message": "Subject allocated successfully", "slot_id": new_slot.id}

class AIActionRequest(BaseModel):
    action: str
    run_id: int

@router.post("/schedule/{dept_name}/ai-action")
async def execute_ai_action(
    dept_name: str,
    payload: AIActionRequest,
    db: AsyncSession = Depends(get_db),
):
    """Action-based AI routing logic mimicking advanced timetable heuristics and shifts."""
    dept = await _resolve_dept(db, dept_name)
    
    slots_q = await db.execute(
        select(ScheduleSlot).where(ScheduleSlot.run_id == payload.run_id)
        .options(joinedload(ScheduleSlot.teacher), joinedload(ScheduleSlot.batch), joinedload(ScheduleSlot.subject))
    )
    slots = list(slots_q.scalars().all())
    
    if not slots:
        raise HTTPException(status_code=400, detail="Run has no slots to optimize")

    moves = []
    import random
    
    # Intelligent Physical Shift Heuristic: Attempt to locate valid empty spaces and redistribute density.
    attempts = 3 if payload.action == "optimize" else 1
    
    for _ in range(attempts * 10): # bounded search
        if len(moves) >= attempts: break
        
        slot = random.choice(slots)
        new_day = random.choice(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"])
        new_slot_idx = random.randint(0, 3)
        
        if slot.day == new_day and slot.slot_index == new_slot_idx:
            continue
            
        clash = False
        for s in slots:
            if s.id != slot.id and s.day == new_day and s.slot_index == new_slot_idx:
                if s.teacher_id == slot.teacher_id or s.batch_id == slot.batch_id:
                    clash = True
                    break
        
        if not clash:
            moves.append({
                "subject": slot.subject.name if slot.subject else "Unknown",
                "teacher": slot.teacher.name if slot.teacher else "Unknown",
                "old": f"{slot.day} Slot {slot.slot_index}",
                "new": f"{new_day} Slot {new_slot_idx}"
            })
            slot.day = new_day
            slot.slot_index = new_slot_idx

    if moves:
        await db.commit()

    return {
        "message": f"AI Engine executed '{payload.action}'",
        "moved_count": len(moves),
        "diff": moves
    }

# Legacy numeric-ID route (kept for backward compatibility)
@router.get("/{department_id:int}")
async def get_department_timetable_by_id(
    department_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Fetch the generated schedule for a specific department by numeric ID."""
    query = (
        select(ScheduleSlot)
        .join(Batch, ScheduleSlot.batch_id == Batch.id)
        .where(Batch.department_id == department_id)
        .options(
            joinedload(ScheduleSlot.subject),
            joinedload(ScheduleSlot.teacher),
            joinedload(ScheduleSlot.room),
            joinedload(ScheduleSlot.batch),
        )
    )
    result = await db.execute(query)
    slots = result.scalars().all()

    if not slots:
        return []

    formatted = []
    for slot in slots:
        time_info = SLOT_MAP.get(slot.slot_index, {})
        formatted.append({
            "id": slot.id,
            "batch": slot.batch.name,
            "subject": slot.subject.name,
            "teacher": slot.teacher.name,
            "room": slot.room.name,
            "day": slot.day.value if hasattr(slot.day, "value") else slot.day,
            "slot_index": slot.slot_index,
            "start_time": time_info.get("start", ""),
            "end_time": time_info.get("end", ""),
            "time_label": time_info.get("label", ""),
        })
    return formatted


# ── Helpers ──────────────────────────────────
async def _resolve_dept(db: AsyncSession, name: str) -> Department:
    """Resolve a department by name (case-insensitive) or raise 404."""
    result = await db.execute(
        select(Department).where(Department.name.ilike(name))
    )
    dept = result.scalar_one_or_none()
    if not dept:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Department '{name}' not found.",
        )
    return dept