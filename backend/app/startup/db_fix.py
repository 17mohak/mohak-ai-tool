from sqlalchemy import text
from app.core.database import engine


async def fix_user_roles():
    # First, add 'STAFF' to the enum if it doesn't exist (in separate transaction)
    async with engine.begin() as conn:
        try:
            await conn.execute(
                text("""
                ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'STAFF';
            """)
            )
            print("[DB FIX] Added STAFF to userrole enum")
        except Exception as e:
            print(f"[DB FIX] Note: Could not add STAFF to enum: {e}")

    # Then update users (in separate transaction so enum change is visible)
    async with engine.begin() as conn:
        result = await conn.execute(
            text("""
            UPDATE users
            SET role = 'STAFF'
            WHERE role NOT IN ('ADMIN', 'STAFF');
        """)
        )
        print(f"[DB FIX] User roles normalized ({result.rowcount} rows updated)")
