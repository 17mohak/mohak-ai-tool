"""add variant_number to timetable_runs

Revision ID: 007_add_variant_number
Revises: 006_add_leave_applications
Create Date: 2026-03-21

Adds variant_number column to timetable_runs to track different schedule variants.
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "007_add_variant_number"
down_revision: Union[str, None] = "006_add_leave_applications"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "timetable_runs",
        sa.Column("variant_number", sa.Integer(), nullable=True, index=True),
    )


def downgrade() -> None:
    op.drop_column("timetable_runs", "variant_number")
