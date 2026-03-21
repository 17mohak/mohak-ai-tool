"""add leave_applications table

Revision ID: 006_add_leave_applications
Revises: 005_add_missing_columns
Create Date: 2026-03-21

Adds leave applications table for teacher leave management.
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "006_add_leave_applications"
down_revision: Union[str, None] = "005_add_missing_columns"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "leave_applications",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column(
            "teacher_id",
            sa.Integer(),
            sa.ForeignKey("teachers.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "start_date",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "end_date",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.String(32),
            nullable=False,
            server_default="PENDING",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=True,
            server_default=sa.func.now(),
        ),
    )


def downgrade() -> None:
    op.drop_table("leave_applications")
