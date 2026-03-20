"""add missing timetable columns and tables

Revision ID: 005_add_missing_columns
Revises: 004_timetable_domain
Create Date: 2026-03-21

Adds columns and tables missing from 004:
  - batches: max_classes_per_day, parent_batch_id
  - teachers: email, preferred_start_slot, preferred_end_slot, max_classes_per_day
  - subjects: code
  - teacher_unavailabilities table
  - pinned_slots table
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "005_add_missing_columns"
down_revision: Union[str, None] = "004_timetable_domain"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

from sqlalchemy.dialects.postgresql import ENUM

DAY_ENUM = ENUM(
    "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY",
    name="dayofweek",
    create_type=False,
)


def upgrade() -> None:
    # ── batches: add max_classes_per_day and parent_batch_id ──
    op.add_column(
        "batches",
        sa.Column("max_classes_per_day", sa.Integer(), nullable=False, server_default="6"),
    )
    op.add_column(
        "batches",
        sa.Column(
            "parent_batch_id",
            sa.Integer(),
            sa.ForeignKey("batches.id"),
            nullable=True,
            index=True,
        ),
    )

    # ── teachers: add email, preferred_start_slot, preferred_end_slot, max_classes_per_day ──
    op.add_column(
        "teachers",
        sa.Column("email", sa.String(255), nullable=True),
    )
    op.add_column(
        "teachers",
        sa.Column("preferred_start_slot", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "teachers",
        sa.Column("preferred_end_slot", sa.Integer(), nullable=False, server_default="8"),
    )
    op.add_column(
        "teachers",
        sa.Column("max_classes_per_day", sa.Integer(), nullable=False, server_default="4"),
    )

    # ── subjects: add code ──
    op.add_column(
        "subjects",
        sa.Column("code", sa.String(32), nullable=True),
    )

    # ── teacher_unavailabilities table ──
    op.create_table(
        "teacher_unavailabilities",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column(
            "teacher_id",
            sa.Integer(),
            sa.ForeignKey("teachers.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("day", DAY_ENUM, nullable=False),
        sa.Column("slot_index", sa.Integer(), nullable=False),
        sa.UniqueConstraint("teacher_id", "day", "slot_index", name="uq_teacher_day_slot"),
    )

    # ── pinned_slots table ──
    op.create_table(
        "pinned_slots",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column(
            "subject_id",
            sa.Integer(),
            sa.ForeignKey("subjects.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("day", DAY_ENUM, nullable=False),
        sa.Column("slot_index", sa.Integer(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("pinned_slots")
    op.drop_table("teacher_unavailabilities")
    op.drop_column("subjects", "code")
    op.drop_column("teachers", "max_classes_per_day")
    op.drop_column("teachers", "preferred_end_slot")
    op.drop_column("teachers", "preferred_start_slot")
    op.drop_column("teachers", "email")
    op.drop_column("batches", "parent_batch_id")
    op.drop_column("batches", "max_classes_per_day")
