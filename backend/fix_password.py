#!/usr/bin/env python3
"""Fix user password directly in database."""

import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

# Database URL
DATABASE_URL = "postgresql+asyncpg://atlas:atlas_secret@localhost:5432/atlas_db"

# Correct bcrypt hash for "password"
# Generated with: passlib CryptContext(schemes=["bcrypt"]).hash("password")
CORRECT_HASH = "$2b$12$6tZ/eEvprRGcTAxgrEugg.HM8dv0S6/ZxBzRNpXA/3R3453.2xXrO"


async def fix_password():
    """Update admin user with correct password hash."""
    print("Fixing admin user password...")

    engine = create_async_engine(DATABASE_URL, echo=False)

    async with engine.begin() as conn:
        # Update admin user password
        result = await conn.execute(
            text("""
                UPDATE users 
                SET hashed_password = :hash
                WHERE email = 'admin@atlasuniversity.edu.in'
                RETURNING email, id
            """),
            {"hash": CORRECT_HASH},
        )
        row = result.fetchone()

        if row:
            print(f"[OK] Updated password for: {row[0]} (ID: {row[1]})")
        else:
            print("[INFO] Admin user not found, checking if we need to insert...")

            # Check if user exists
            result = await conn.execute(
                text(
                    "SELECT COUNT(*) FROM users WHERE email = 'admin@atlasuniversity.edu.in'"
                )
            )
            count = result.scalar()

            if count == 0:
                # Insert new admin user
                await conn.execute(
                    text("""
                        INSERT INTO users (email, hashed_password, role, status, is_active, created_at)
                        VALUES (
                            'admin@atlasuniversity.edu.in',
                            :hash,
                            'ADMIN',
                            'APPROVED',
                            true,
                            NOW()
                        )
                    """),
                    {"hash": CORRECT_HASH},
                )
                print("[OK] Created new admin user with correct password")
            else:
                print("[WARN] User exists but update didn't return row")

    await engine.dispose()
    print("\n[OK] Password fix complete!")
    print("\nTest with:")
    print(
        'curl -X POST http://localhost:8000/api/auth/login -H "Content-Type: application/json" -d "{\\"email\\":\\"admin@atlasuniversity.edu.in\\",\\"password\\":\\"password\\"}"'
    )


if __name__ == "__main__":
    asyncio.run(fix_password())
