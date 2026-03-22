from sqlalchemy import text
from app.core.database import engine

DEPARTMENTS = ["UGDX", "ISME", "ISDI", "LAW"]


async def seed_departments():
    async with engine.begin() as conn:
        for dept in DEPARTMENTS:
            await conn.execute(
                text(f"""
                INSERT INTO departments (name)
                SELECT '{dept}'
                WHERE NOT EXISTS (
                    SELECT 1 FROM departments WHERE name = '{dept}'
                );
            """)
            )
        print("[DB SEED] Departments ensured")
