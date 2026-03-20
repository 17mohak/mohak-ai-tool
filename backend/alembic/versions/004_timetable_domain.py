"""create timetable domain tables

Revision ID: 004_timetable_domain
Revises: e05020bcdc7e
Create Date: 2026-03-19

Creates the full timetable domain schema:
  - departments
  - teachers
  - subjects (with batch_id and teacher_id FKs)
  - rooms
  - batches
  - timetable_runs (generation history / versioning)
  - schedule_slots (solver output, linked to a run)
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "004_timetable_domain"
down_revision: Union[str, None] = "e05020bcdc7e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Enum type names that match the SQLAlchemy model declarations
DAY_ENUM = sa.Enum(
    "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY",
    name="dayofweek",
)
RUN_STATUS_ENUM = sa.Enum("DRAFT", "PUBLISHED", "FAILED", name="runstatus")


def upgrade() -> None:
    # 1. departments
    op.create_table(
        "departments",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("name", sa.String(255), unique=True, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=True,
            server_default=sa.func.now(),
        ),
    )

    # 2. teachers
    op.create_table(
        "teachers",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column(
            "department_id",
            sa.Integer(),
            sa.ForeignKey("departments.id"),
            nullable=False,
            index=True,
        ),
    )

    # 3. rooms
    op.create_table(
        "rooms",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("capacity", sa.Integer(), nullable=False),
        sa.Column("is_lab", sa.Boolean(), nullable=False, server_default="false"),
    )

    # 4. batches
    op.create_table(
        "batches",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column(
            "department_id",
            sa.Integer(),
            sa.ForeignKey("departments.id"),
            nullable=False,
            index=True,
        ),
    )

    # 5. subjects (with batch_id + teacher_id FKs)
    op.create_table(
        "subjects",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("credits", sa.Integer(), nullable=False, server_default="3"),
        sa.Column(
            "department_id",
            sa.Integer(),
            sa.ForeignKey("departments.id"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "batch_id",
            sa.Integer(),
            sa.ForeignKey("batches.id"),
            nullable=True,
            index=True,
        ),
        sa.Column(
            "teacher_id",
            sa.Integer(),
            sa.ForeignKey("teachers.id"),
            nullable=True,
            index=True,
        ),
    )

    # 6. timetable_runs
    op.create_table(
        "timetable_runs",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column(
            "department_id",
            sa.Integer(),
            sa.ForeignKey("departments.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("status", RUN_STATUS_ENUM, nullable=False, server_default="DRAFT"),
        sa.Column(
            "solver_status", sa.String(64), nullable=False, server_default="PENDING"
        ),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=True,
            server_default=sa.func.now(),
        ),
    )

    # 7. schedule_slots
    op.create_table(
        "schedule_slots",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column(
            "run_id",
            sa.Integer(),
            sa.ForeignKey("timetable_runs.id", ondelete="CASCADE"),
            nullable=True,
            index=True,
        ),
        sa.Column(
            "batch_id",
            sa.Integer(),
            sa.ForeignKey("batches.id"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "subject_id",
            sa.Integer(),
            sa.ForeignKey("subjects.id"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "teacher_id",
            sa.Integer(),
            sa.ForeignKey("teachers.id"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "room_id",
            sa.Integer(),
            sa.ForeignKey("rooms.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("day", DAY_ENUM, nullable=False),
        sa.Column("slot_index", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=True,
            server_default=sa.func.now(),
        ),
    )


def downgrade() -> None:
    op.drop_table("schedule_slots")
    op.drop_table("timetable_runs")
    op.drop_table("subjects")
    op.drop_table("batches")
    op.drop_table("rooms")
    op.drop_table("teachers")
    op.drop_table("departments")

    # Drop the custom enum types
    DAY_ENUM.drop(op.get_bind(), checkfirst=True)
    RUN_STATUS_ENUM.drop(op.get_bind(), checkfirst=True)
