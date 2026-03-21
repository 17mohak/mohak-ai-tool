"""
Timetable domain models for the Smart Class Scheduler.

Defines the core entities: Department, Teacher, Subject, Room, Batch,
TeacherUnavailability, PinnedSlot, a TimetableRun (generation history),
and the generated ScheduleSlot records.

Faithfully mirrors the SmartClassScheduler domain.
"""

import enum
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


# ──────────────────────────────────────────────
# Enums
# ──────────────────────────────────────────────
class DayOfWeek(str, enum.Enum):
    MONDAY = "MONDAY"
    TUESDAY = "TUESDAY"
    WEDNESDAY = "WEDNESDAY"
    THURSDAY = "THURSDAY"
    FRIDAY = "FRIDAY"


class RunStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    FAILED = "FAILED"


# ──────────────────────────────────────────────
# Domain Tables
# ──────────────────────────────────────────────
class Department(Base):
    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # relationships
    teachers: Mapped[list["Teacher"]] = relationship(back_populates="department")
    subjects: Mapped[list["Subject"]] = relationship(back_populates="department")
    batches: Mapped[list["Batch"]] = relationship(back_populates="department")
    runs: Mapped[list["TimetableRun"]] = relationship(back_populates="department")


class Teacher(Base):
    __tablename__ = "teachers"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    department_id: Mapped[int] = mapped_column(
        ForeignKey("departments.id"), nullable=False, index=True
    )
    preferred_start_slot: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )
    preferred_end_slot: Mapped[int] = mapped_column(Integer, nullable=False, default=8)
    max_classes_per_day: Mapped[int] = mapped_column(Integer, nullable=False, default=4)

    department: Mapped["Department"] = relationship(back_populates="teachers")
    unavailabilities: Mapped[list["TeacherUnavailability"]] = relationship(
        back_populates="teacher", cascade="all, delete-orphan"
    )


class TeacherUnavailability(Base):
    """A teacher is unavailable for a specific day/slot combination."""

    __tablename__ = "teacher_unavailabilities"
    __table_args__ = (
        UniqueConstraint("teacher_id", "day", "slot_index", name="uq_teacher_day_slot"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    teacher_id: Mapped[int] = mapped_column(
        ForeignKey("teachers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    day: Mapped[DayOfWeek] = mapped_column(Enum(DayOfWeek), nullable=False)
    slot_index: Mapped[int] = mapped_column(Integer, nullable=False)

    teacher: Mapped["Teacher"] = relationship(back_populates="unavailabilities")


class LeaveApplication(Base):
    """Teacher leave applications for specific date ranges."""

    __tablename__ = "leave_applications"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    teacher_id: Mapped[int] = mapped_column(
        ForeignKey("teachers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    start_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    end_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="PENDING")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    teacher: Mapped["Teacher"] = relationship(foreign_keys=[teacher_id])


class Subject(Base):
    __tablename__ = "subjects"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    credits: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    department_id: Mapped[int] = mapped_column(
        ForeignKey("departments.id"), nullable=False, index=True
    )
    # Each subject row is scoped to a specific batch and assigned teacher
    # (matching the seed data where the same course name appears once per batch).
    batch_id: Mapped[int | None] = mapped_column(
        ForeignKey("batches.id"), nullable=True, index=True
    )
    teacher_id: Mapped[int | None] = mapped_column(
        ForeignKey("teachers.id"), nullable=True, index=True
    )

    department: Mapped["Department"] = relationship(back_populates="subjects")
    batch: Mapped["Batch | None"] = relationship(foreign_keys=[batch_id])
    teacher: Mapped["Teacher | None"] = relationship(foreign_keys=[teacher_id])


class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    is_lab: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class Batch(Base):
    __tablename__ = "batches"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    max_classes_per_day: Mapped[int] = mapped_column(Integer, nullable=False, default=6)
    department_id: Mapped[int] = mapped_column(
        ForeignKey("departments.id"), nullable=False, index=True
    )
    parent_batch_id: Mapped[int | None] = mapped_column(
        ForeignKey("batches.id"), nullable=True, index=True
    )

    department: Mapped["Department"] = relationship(back_populates="batches")
    parent_batch: Mapped["Batch | None"] = relationship(
        remote_side="Batch.id", foreign_keys=[parent_batch_id]
    )
    children: Mapped[list["Batch"]] = relationship(
        back_populates="parent_batch", foreign_keys="Batch.parent_batch_id"
    )


class PinnedSlot(Base):
    """A subject must be placed exactly at this day/slot (hard constraint)."""

    __tablename__ = "pinned_slots"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    subject_id: Mapped[int] = mapped_column(
        ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    day: Mapped[DayOfWeek] = mapped_column(Enum(DayOfWeek), nullable=False)
    slot_index: Mapped[int] = mapped_column(Integer, nullable=False)

    subject: Mapped["Subject"] = relationship(foreign_keys=[subject_id])


# ──────────────────────────────────────────────
# Timetable Run (generation history)
# ──────────────────────────────────────────────
class TimetableRun(Base):
    """Tracks each generation attempt for a department."""

    __tablename__ = "timetable_runs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    department_id: Mapped[int] = mapped_column(
        ForeignKey("departments.id"), nullable=False, index=True
    )
    variant_number: Mapped[int] = mapped_column(Integer, nullable=True, index=True)
    status: Mapped[RunStatus] = mapped_column(
        Enum(RunStatus), default=RunStatus.DRAFT, nullable=False
    )
    solver_status: Mapped[str] = mapped_column(
        String(64), nullable=False, default="PENDING"
    )
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    department: Mapped["Department"] = relationship(back_populates="runs")
    slots: Mapped[list["ScheduleSlot"]] = relationship(
        back_populates="run", cascade="all, delete-orphan"
    )


# ──────────────────────────────────────────────
# Generated Schedule (persisted result)
# ──────────────────────────────────────────────
class ScheduleSlot(Base):
    """Stores a single allocated time-slot produced by the CP-SAT solver."""

    __tablename__ = "schedule_slots"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    run_id: Mapped[int | None] = mapped_column(
        ForeignKey("timetable_runs.id", ondelete="CASCADE"), nullable=True, index=True
    )
    batch_id: Mapped[int] = mapped_column(
        ForeignKey("batches.id"), nullable=False, index=True
    )
    subject_id: Mapped[int] = mapped_column(
        ForeignKey("subjects.id"), nullable=False, index=True
    )
    teacher_id: Mapped[int] = mapped_column(
        ForeignKey("teachers.id"), nullable=False, index=True
    )
    room_id: Mapped[int] = mapped_column(
        ForeignKey("rooms.id"), nullable=False, index=True
    )
    day: Mapped[DayOfWeek] = mapped_column(Enum(DayOfWeek), nullable=False)
    slot_index: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    run: Mapped["TimetableRun | None"] = relationship(back_populates="slots")
    batch: Mapped["Batch"] = relationship(foreign_keys=[batch_id])
    subject: Mapped["Subject"] = relationship(foreign_keys=[subject_id])
    teacher: Mapped["Teacher"] = relationship(foreign_keys=[teacher_id])
    room: Mapped["Room"] = relationship(foreign_keys=[room_id])
