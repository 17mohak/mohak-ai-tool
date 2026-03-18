from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.core.database import get_db
from app.models.timetable import ScheduleSlot, Batch 

router = APIRouter(prefix="/timetable", tags=["timetable"])

@router.get("/{department_id}")
async def get_department_timetable(
    department_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Fetch the generated schedule for a specific department."""
    
    # Query all slots for batches belonging to this department
    query = (
        select(ScheduleSlot)
        .join(Batch, ScheduleSlot.batch_id == Batch.id)
        .where(Batch.department_id == department_id)
        .options(
            joinedload(ScheduleSlot.subject),
            joinedload(ScheduleSlot.teacher),
            joinedload(ScheduleSlot.room),
            joinedload(ScheduleSlot.batch)
        )
    )
    
    result = await db.execute(query)
    slots = result.scalars().all()

    if not slots:
        return []

    # Format the payload exactly how the frontend grid expects it
    formatted_schedule = [
        {
            "id": slot.id,
            "batch": slot.batch.name,
            "subject": slot.subject.name,
            "teacher": slot.teacher.name,
            "room": slot.room.name,
            "day": slot.day.value if hasattr(slot.day, 'value') else slot.day,
            "slot_index": slot.slot_index,
        }
        for slot in slots
    ]

    return formatted_schedule