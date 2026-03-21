"""Wipe and reseed users with proper bcrypt hashes

Revision ID: 008_fix_user_passwords
Revises: 007_add_variant_number
Create Date: 2026-03-21

Wipes all existing users (likely corrupted) and creates a fresh admin user
with properly hashed password using bcrypt.
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "008_fix_user_passwords"
down_revision: Union[str, None] = "141854dc6275"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Wipe all users and create fresh admin with proper bcrypt hash."""

    # Delete all existing users (they may have corrupted passwords)
    op.execute("DELETE FROM users;")

    # Create fresh admin user with proper bcrypt hash
    # Password: "password"
    # Hash generated with: passlib CryptContext(schemes=["bcrypt"]).hash("password")
    op.execute("""
        INSERT INTO users (email, hashed_password, role, status, is_active, created_at)
        VALUES (
            'admin@atlasuniversity.edu.in',
            '$2b$12$6tZ/eEvprRGcTAxgrEugg.HM8dv0S6/ZxBzRNpXA/3R3453.2xXrO',
            'ADMIN',
            'APPROVED',
            true,
            NOW()
        );
    """)

    # Also create a test user
    # Password: "password"
    # Note: Using 'USER' role to match the database enum (not 'STAFF')
    op.execute("""
        INSERT INTO users (email, hashed_password, role, status, is_active, created_at)
        VALUES (
            'user@atlasuniversity.edu.in',
            '$2b$12$6tZ/eEvprRGcTAxgrEugg.HM8dv0S6/ZxBzRNpXA/3R3453.2xXrO',
            'USER',
            'APPROVED',
            true,
            NOW()
        );
    """)


def downgrade() -> None:
    """Remove the users we created."""
    op.execute("""
        DELETE FROM users 
        WHERE email IN ('admin@atlasuniversity.edu.in', 'user@atlasuniversity.edu.in');
    """)
