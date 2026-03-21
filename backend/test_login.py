#!/usr/bin/env python3
"""Full integration test for login endpoint."""

import asyncio
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.core.config import settings
from app.core.security import verify_password, get_password_hash

# Database URL for testing - use localhost since we're outside Docker
DATABASE_URL = "postgresql+asyncpg://atlas:atlas_secret@localhost:5432/atlas_db"


async def test_login():
    """Test the login functionality."""
    print("=" * 60)
    print("LOGIN INTEGRATION TEST")
    print("=" * 60)

    # Create engine
    try:
        engine = create_async_engine(DATABASE_URL, echo=False)
        print("\n[OK] Database engine created")
    except Exception as e:
        print(f"\n[FAIL] Failed to create engine: {e}")
        return False

    # Create session
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # Test 1: Check if users exist
        print("\n1. Checking database connection and users...")
        try:
            from sqlalchemy import select, text

            result = await session.execute(text("SELECT COUNT(*) FROM users"))
            count = result.scalar()
            print(f"   [OK] Database connected. Users in DB: {count}")

            if count == 0:
                print("   [WARN] No users found! Migration may not have run.")
        except Exception as e:
            print(f"   [FAIL] Database error: {e}")
            return False

        # Test 2: Try to fetch admin user
        print("\n2. Fetching admin user...")
        try:
            from app.models.user import User

            result = await session.execute(
                select(User).where(User.email == "admin@atlasuniversity.edu.in")
            )
            user = result.scalar_one_or_none()

            if not user:
                print("   [FAIL] Admin user not found!")
                return False

            print(f"   [OK] Admin user found: {user.email}")
            print(f"   [OK] User ID: {user.id}")
            print(f"   [OK] Status: {user.status.value}")
            print(f"   [OK] Role: {user.role.value}")
            print(f"   [OK] Is Active: {user.is_active}")

            if user.hashed_password:
                print(
                    f"   [OK] Has password: Yes (starts with: {user.hashed_password[:10]}...)"
                )
            else:
                print("   [FAIL] No password set!")
                return False

        except Exception as e:
            print(f"   [FAIL] Error fetching user: {e}")
            import traceback

            traceback.print_exc()
            return False

        # Test 3: Verify password
        print("\n3. Testing password verification...")
        try:
            from app.core.security import verify_password

            result = verify_password("password", user.hashed_password)
            print(f"   [OK] Password verification result: {result}")

            if not result:
                print("   [FAIL] Password verification failed!")
                return False
        except Exception as e:
            print(f"   [FAIL] Password verification error: {type(e).__name__}: {e}")
            import traceback

            traceback.print_exc()
            return False

        # Test 4: Simulate full login flow
        print("\n4. Simulating full login flow...")
        try:
            from app.core.security import create_access_token

            token = create_access_token(data={"sub": str(user.id)})
            print("   [OK] Access token created successfully")
            print(f"   [OK] Token length: {len(token)} chars")
        except Exception as e:
            print(f"   [FAIL] Token creation failed: {e}")
            return False

    await engine.dispose()

    print("\n" + "=" * 60)
    print("ALL TESTS PASSED!")
    print("=" * 60)
    print("\nYou can now test via curl:")
    print(
        'curl -X POST http://localhost:8000/api/auth/login -H "Content-Type: application/json" -d "{\\"email\\":\\"admin@atlasuniversity.edu.in\\",\\"password\\":\\"password\\"}"'
    )
    return True


if __name__ == "__main__":
    result = asyncio.run(test_login())
    sys.exit(0 if result else 1)
