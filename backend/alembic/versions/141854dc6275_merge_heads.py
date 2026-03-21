"""merge heads

Revision ID: 141854dc6275
Revises: 0430a2e4b237, 007_add_variant_number
Create Date: 2026-03-21 17:03:22.889949

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '141854dc6275'
down_revision: Union[str, None] = ('0430a2e4b237', '007_add_variant_number')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
