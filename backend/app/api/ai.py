from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func
from typing import List

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.policy import Policy
from app.models.timetable import TimetableRun, RunStatus, Teacher, Batch
from app.schemas.ai_schema import (
    PolicyCreate,
    PolicyUpdate,
    PolicyResponse,
    PolicyTranslateRequest,
    InsightResponse,
    ChatRequest,
    ChatResponse,
)
from app.services.ai.policy import policy_service
from app.services.ai.insights import insights_service
from app.services.ai.chat import chat_service

router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/policies", response_model=List[PolicyResponse])
async def get_policies(
    db: AsyncSession = Depends(get_db),
):
    """Get all policies."""
    result = await db.execute(
        select(Policy).order_by(desc(Policy.priority), desc(Policy.created_at))
    )
    policies = result.scalars().all()
    return policies


@router.post("/policies", response_model=PolicyResponse)
async def create_policy(
    policy_data: PolicyCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new policy."""
    policy = Policy(
        name=policy_data.name,
        description=policy_data.description,
        policy_type=policy_data.policy_type,
        natural_language=policy_data.natural_language,
        dsl=policy_data.dsl,
        priority=policy_data.priority,
    )
    db.add(policy)
    await db.commit()
    await db.refresh(policy)
    return policy


@router.get("/policies/{policy_id}", response_model=PolicyResponse)
async def get_policy(
    policy_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Get a specific policy."""
    result = await db.execute(select(Policy).where(Policy.id == policy_id))
    policy = result.scalar_one_or_none()

    if not policy:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Policy not found"
        )

    return policy


@router.put("/policies/{policy_id}", response_model=PolicyResponse)
async def update_policy(
    policy_id: int,
    policy_data: PolicyUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a policy."""
    result = await db.execute(select(Policy).where(Policy.id == policy_id))
    policy = result.scalar_one_or_none()

    if not policy:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Policy not found"
        )

    for field, value in policy_data.model_dump(exclude_unset=True).items():
        setattr(policy, field, value)

    await db.commit()
    await db.refresh(policy)
    return policy


@router.delete("/policies/{policy_id}")
async def delete_policy(
    policy_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a policy."""
    result = await db.execute(select(Policy).where(Policy.id == policy_id))
    policy = result.scalar_one_or_none()

    if not policy:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Policy not found"
        )

    await db.delete(policy)
    await db.commit()
    return {"message": "Policy deleted successfully"}


@router.post("/policies/translate")
async def translate_policy(
    request: PolicyTranslateRequest,
):
    """Translate natural language policy to DSL."""
    dsl = await policy_service.translate_policy(request.natural_language)
    validation = await policy_service.validate_policy(dsl)

    return {
        "natural_language": request.natural_language,
        "dsl": dsl,
        "validation": validation,
    }


@router.get("/insights", response_model=List[InsightResponse])
async def get_insights(
    db: AsyncSession = Depends(get_db),
):
    """Get AI-generated insights from real system data."""
    # Fetch real counts from database
    result = await db.execute(select(func.count(User.id)))
    user_count = result.scalar() or 0

    result = await db.execute(
        select(func.count(TimetableRun.id)).where(
            TimetableRun.status == RunStatus.PUBLISHED
        )
    )
    published_timetables = result.scalar() or 0

    result = await db.execute(select(func.count(Teacher.id)))
    teacher_count = result.scalar() or 0

    result = await db.execute(select(func.count(Batch.id)))
    batch_count = result.scalar() or 0

    system_data = {
        "user_count": user_count,
        "published_timetables": published_timetables,
        "teacher_count": teacher_count,
        "batch_count": batch_count,
    }

    insights = await insights_service.generate_insights(system_data)
    return insights


@router.post("/insights/generate")
async def generate_insights(
    db: AsyncSession = Depends(get_db),
):
    """Trigger manual insights generation."""
    # Fetch real counts from database
    result = await db.execute(select(func.count(User.id)))
    user_count = result.scalar() or 0

    result = await db.execute(
        select(func.count(TimetableRun.id)).where(
            TimetableRun.status == RunStatus.PUBLISHED
        )
    )
    published_timetables = result.scalar() or 0

    system_data = {
        "user_count": user_count,
        "published_timetables": published_timetables,
    }

    insights = await insights_service.generate_insights(system_data)
    return {"message": "Insights generated successfully", "insights": insights}


@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
):
    """Chat with AI Manager."""
    messages = [{"role": msg.role, "content": msg.content} for msg in request.messages]

    response = await chat_service.chat(
        messages=messages,
        user_email=current_user.email,
        user_role=current_user.role.value,
        current_page=request.current_page,
    )

    return response
