from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from datetime import datetime, timezone
from pydantic import BaseModel

from app.core.database import get_db
from app.models.user import User, UserStatus
from app.models.audit import AuditLog
from app.models.timetable import Department, Batch, Subject, Teacher
from app.schemas.user_schema import UserResponse

router = APIRouter(prefix="/admin", tags=["admin"])


# ============================================================================
# Pydantic Schemas
# ============================================================================


class DepartmentCreate(BaseModel):
    name: str


class DepartmentResponse(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True


class BatchCreate(BaseModel):
    name: str
    department_id: int


class BatchResponse(BaseModel):
    id: int
    name: str
    department_id: int

    class Config:
        from_attributes = True


class SubjectCreate(BaseModel):
    name: str
    batch_id: int


class SubjectResponse(BaseModel):
    id: int
    name: str
    batch_id: int

    class Config:
        from_attributes = True


class FacultyCreate(BaseModel):
    name: str
    department_id: int


class FacultyResponse(BaseModel):
    id: int
    name: str
    department_id: int

    class Config:
        from_attributes = True


# ============================================================================
# DEPARTMENTS
# ============================================================================


@router.get("/departments", response_model=list[DepartmentResponse])
async def get_all_departments(
    db: AsyncSession = Depends(get_db),
):
    """Get all departments."""
    result = await db.execute(select(Department).order_by(Department.name))
    departments = result.scalars().all()
    return [{"id": dept.id, "name": dept.name} for dept in departments]


@router.post("/departments", response_model=DepartmentResponse, status_code=201)
async def create_department(
    dept: DepartmentCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new department."""
    new_dept = Department(name=dept.name)
    db.add(new_dept)
    await db.flush()
    await db.refresh(new_dept)
    return {"id": new_dept.id, "name": new_dept.name}


# ============================================================================
# BATCHES
# ============================================================================


@router.get("/batches", response_model=list[BatchResponse])
async def get_all_batches(
    db: AsyncSession = Depends(get_db),
):
    """Get all batches."""
    result = await db.execute(select(Batch).order_by(Batch.name))
    batches = result.scalars().all()
    return [
        {"id": batch.id, "name": batch.name, "department_id": batch.department_id}
        for batch in batches
    ]


@router.post("/batches", response_model=BatchResponse, status_code=201)
async def create_batch(
    batch: BatchCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new batch."""
    # Verify department exists
    dept_result = await db.execute(
        select(Department).where(Department.id == batch.department_id)
    )
    dept = dept_result.scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    new_batch = Batch(
        name=batch.name,
        department_id=batch.department_id,
        size=60,
        max_classes_per_day=6,
    )
    db.add(new_batch)
    await db.flush()
    await db.refresh(new_batch)
    return {
        "id": new_batch.id,
        "name": new_batch.name,
        "department_id": new_batch.department_id,
    }


# ============================================================================
# SUBJECTS
# ============================================================================


@router.get("/subjects", response_model=list[SubjectResponse])
async def get_all_subjects(
    db: AsyncSession = Depends(get_db),
):
    """Get all subjects."""
    result = await db.execute(select(Subject).order_by(Subject.name))
    subjects = result.scalars().all()
    return [
        {"id": subj.id, "name": subj.name, "batch_id": subj.batch_id}
        for subj in subjects
    ]


@router.post("/subjects", response_model=SubjectResponse, status_code=201)
async def create_subject(
    subject: SubjectCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new subject."""
    # Verify batch exists
    batch_result = await db.execute(select(Batch).where(Batch.id == subject.batch_id))
    batch = batch_result.scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    new_subject = Subject(
        name=subject.name,
        batch_id=subject.batch_id,
        department_id=batch.department_id,
        credits=3,
    )
    db.add(new_subject)
    await db.flush()
    await db.refresh(new_subject)
    return {
        "id": new_subject.id,
        "name": new_subject.name,
        "batch_id": new_subject.batch_id,
    }


# ============================================================================
# FACULTY (TEACHERS)
# ============================================================================


@router.get("/faculty", response_model=list[FacultyResponse])
async def get_all_faculty(
    db: AsyncSession = Depends(get_db),
):
    """Get all faculty (teachers)."""
    result = await db.execute(select(Teacher).order_by(Teacher.name))
    teachers = result.scalars().all()
    return [
        {"id": teacher.id, "name": teacher.name, "department_id": teacher.department_id}
        for teacher in teachers
    ]


@router.post("/faculty", response_model=FacultyResponse, status_code=201)
async def create_faculty(
    faculty: FacultyCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new faculty member."""
    # Verify department exists
    dept_result = await db.execute(
        select(Department).where(Department.id == faculty.department_id)
    )
    dept = dept_result.scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    new_teacher = Teacher(
        name=faculty.name, department_id=faculty.department_id, max_classes_per_day=4
    )
    db.add(new_teacher)
    await db.flush()
    await db.refresh(new_teacher)
    return {
        "id": new_teacher.id,
        "name": new_teacher.name,
        "department_id": new_teacher.department_id,
    }


@router.get("/users", response_model=list[UserResponse])
async def get_all_users(
    db: AsyncSession = Depends(get_db),
):
    """Get all users."""
    result = await db.execute(select(User).order_by(desc(User.created_at)))
    users = result.scalars().all()
    return users


@router.get("/users/pending", response_model=list[UserResponse])
async def get_pending_users(
    db: AsyncSession = Depends(get_db),
):
    """Get all pending users awaiting approval."""
    result = await db.execute(
        select(User)
        .where(User.status == UserStatus.PENDING)
        .order_by(desc(User.created_at))
    )
    users = result.scalars().all()
    return users


@router.post("/users/{user_id}/approve")
async def approve_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Approve a pending user."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    if user.status != UserStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"User is already {user.status.value.lower()}",
        )

    user.status = UserStatus.APPROVED
    user.is_active = True
    user.approved_at = datetime.now(timezone.utc)

    await db.commit()
    return {"message": f"User {user.email} approved successfully"}


@router.post("/users/{user_id}/reject")
async def reject_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Reject a pending user."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    if user.status != UserStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"User is already {user.status.value.lower()}",
        )

    user.status = UserStatus.REJECTED
    user.is_active = False

    await db.commit()
    return {"message": f"User {user.email} rejected successfully"}


@router.get("/audit")
async def get_audit_logs(
    limit: int = 100,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    """Get audit logs."""
    result = await db.execute(
        select(AuditLog).order_by(desc(AuditLog.timestamp)).limit(limit).offset(offset)
    )
    logs = result.scalars().all()

    return {
        "logs": [
            {
                "id": log.id,
                "user_id": log.user_id,
                "action": log.action,
                "ip_address": log.ip_address,
                "details": log.details,
                "timestamp": log.timestamp.isoformat(),
            }
            for log in logs
        ],
        "limit": limit,
        "offset": offset,
    }


@router.get("/audit/export")
async def export_audit_logs(
    db: AsyncSession = Depends(get_db),
):
    """Export all audit logs as JSON."""
    result = await db.execute(select(AuditLog).order_by(desc(AuditLog.timestamp)))
    logs = result.scalars().all()

    return {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "total_logs": len(logs),
        "logs": [
            {
                "id": log.id,
                "user_id": log.user_id,
                "action": log.action,
                "ip_address": log.ip_address,
                "details": log.details,
                "timestamp": log.timestamp.isoformat(),
            }
            for log in logs
        ],
    }
