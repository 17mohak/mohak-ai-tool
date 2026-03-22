"""
Atlas Data Reset and Seed Script.

This script performs a full database reset and inserts clean, relational dataset:
- Departments (UGDX, ISME)
- Faculty with @atlasskilltechuniversity.edu emails
- Parent Batches (SY Hadoop, SY Voyagers)
- Lab Batches (A/B children) linked via parent_batch_id
- Subjects mapped correctly to batches and faculty

Usage:
    From backend/ directory:
    python -c "import asyncio; from app.startup.atlas_seed import reset_and_seed; asyncio.run(reset_and_seed())"
"""

import asyncio
import logging
from sqlalchemy import select, delete, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_maker, engine
from app.models.timetable import Department, Teacher, Batch, Subject

logging.basicConfig(level=logging.INFO, format="%(levelname)-5s  %(message)s")
log = logging.getLogger("atlas_seed")


# =============================================================================
# STEP 1 — CLEAN BAD DATA
# =============================================================================


async def clean_existing_data(db: AsyncSession):
    """Delete all existing data from subjects, batches, teachers, departments."""
    log.info("STEP 1: Cleaning existing data...")

    # Delete in order to respect FK constraints
    await db.execute(delete(Subject))
    await db.execute(delete(Batch))
    await db.execute(delete(Teacher))
    await db.execute(delete(Department))

    await db.commit()
    log.info("  ✓ All existing data cleared")


# =============================================================================
# STEP 2 — CREATE DEPARTMENTS
# =============================================================================


async def seed_departments(db: AsyncSession) -> dict[str, int]:
    """Create UGDX and ISME departments."""
    log.info("STEP 2: Creating departments...")

    departments_data = [
        {"id": 1, "name": "UGDX"},
        {"id": 2, "name": "ISME"},
    ]

    dept_map = {}
    for dept_data in departments_data:
        # Reset sequence to use specific IDs
        dept = Department(id=dept_data["id"], name=dept_data["name"])
        db.add(dept)
        await db.flush()
        dept_map[dept_data["name"]] = dept.id
        log.info(f"  + Department: {dept_data['name']} (id={dept.id})")

    return dept_map


# =============================================================================
# STEP 3 — CREATE FACULTY
# =============================================================================


async def seed_faculty(db: AsyncSession, dept_map: dict[str, int]) -> dict[str, int]:
    """Create faculty with @atlasskilltechuniversity.edu emails."""
    log.info("STEP 3: Creating faculty...")

    faculty_data = [
        {
            "name": "Elective Faculty 1",
            "email": "elective.faculty1@atlasskilltechuniversity.edu",
            "dept": "UGDX",
        },
        {
            "name": "Elective Faculty 2",
            "email": "elective.faculty2@atlasskilltechuniversity.edu",
            "dept": "UGDX",
        },
        {
            "name": "Firoz Shaikh",
            "email": "firoz.shaikh@atlasskilltechuniversity.edu",
            "dept": "UGDX",
        },
        {
            "name": "Kunal Meher",
            "email": "kunal.meher@atlasskilltechuniversity.edu",
            "dept": "UGDX",
        },
        {
            "name": "Sujatha Ayyengar",
            "email": "sujatha.ayyengar@atlasskilltechuniversity.edu",
            "dept": "UGDX",
        },
        {
            "name": "Nimesh Bumb",
            "email": "nimesh.bumb@atlasskilltechuniversity.edu",
            "dept": "UGDX",
        },
        {
            "name": "Yogesh Jadhav",
            "email": "yogesh.jadhav@atlasskilltechuniversity.edu",
            "dept": "UGDX",
        },
        {
            "name": "Shashikant Patil",
            "email": "shashikant.patil@atlasskilltechuniversity.edu",
            "dept": "UGDX",
        },
        {
            "name": "Sohel Das",
            "email": "sohel.das@atlasskilltechuniversity.edu",
            "dept": "UGDX",
        },
    ]

    faculty_map = {}
    for fac_data in faculty_data:
        teacher = Teacher(
            name=fac_data["name"],
            email=fac_data["email"],
            department_id=dept_map[fac_data["dept"]],
            preferred_start_slot=0,
            preferred_end_slot=8,
            max_classes_per_day=4,
        )
        db.add(teacher)
        await db.flush()
        faculty_map[fac_data["name"]] = teacher.id
        log.info(f"  + Faculty: {fac_data['name']} (id={teacher.id})")

    return faculty_map


# =============================================================================
# STEP 4 — CREATE BATCH HIERARCHY
# =============================================================================


async def seed_batches(db: AsyncSession, dept_map: dict[str, int]) -> dict[str, int]:
    """Create parent batches and lab child batches."""
    log.info("STEP 4: Creating batch hierarchy...")

    # Parent batches first
    parent_batches = [
        {"id": 1, "name": "SY Hadoop", "size": 60, "dept": "UGDX", "parent_id": None},
        {"id": 2, "name": "SY Voyagers", "size": 60, "dept": "UGDX", "parent_id": None},
    ]

    batch_map = {}

    for batch_data in parent_batches:
        batch = Batch(
            id=batch_data["id"],
            name=batch_data["name"],
            size=batch_data["size"],
            department_id=dept_map[batch_data["dept"]],
            parent_batch_id=batch_data["parent_id"],
            max_classes_per_day=6,
        )
        db.add(batch)
        await db.flush()
        batch_map[batch_data["name"]] = batch.id
        log.info(f"  + Parent Batch: {batch_data['name']} (id={batch.id})")

    # Reset the sequence for batches table so auto-increment works correctly
    await db.execute(
        text("SELECT setval('batches_id_seq', (SELECT MAX(id) FROM batches))")
    )
    await db.flush()

    # Lab child batches
    lab_batches = [
        {
            "name": "SY Hadoop - Lab A",
            "size": 30,
            "dept": "UGDX",
            "parent_name": "SY Hadoop",
        },
        {
            "name": "SY Hadoop - Lab B",
            "size": 30,
            "dept": "UGDX",
            "parent_name": "SY Hadoop",
        },
        {
            "name": "SY Voyagers - Lab A",
            "size": 30,
            "dept": "UGDX",
            "parent_name": "SY Voyagers",
        },
        {
            "name": "SY Voyagers - Lab B",
            "size": 30,
            "dept": "UGDX",
            "parent_name": "SY Voyagers",
        },
    ]

    for batch_data in lab_batches:
        batch = Batch(
            name=batch_data["name"],
            size=batch_data["size"],
            department_id=dept_map[batch_data["dept"]],
            parent_batch_id=batch_map[batch_data["parent_name"]],
            max_classes_per_day=6,
        )
        db.add(batch)
        await db.flush()
        batch_map[batch_data["name"]] = batch.id
        log.info(
            f"  + Lab Batch: {batch_data['name']} (id={batch.id}, parent={batch_data['parent_name']})"
        )

    return batch_map


# =============================================================================
# STEP 5 — CREATE SUBJECTS
# =============================================================================


async def seed_subjects(
    db: AsyncSession,
    dept_map: dict[str, int],
    faculty_map: dict[str, int],
    batch_map: dict[str, int],
):
    """Create subjects mapped correctly to batches and faculty."""
    log.info("STEP 5: Creating subjects...")

    subject_count = 0

    # ELECTIVES → Parent batches
    elective_faculty = ["Elective Faculty 1", "Elective Faculty 2"]
    parent_batches = ["SY Hadoop", "SY Voyagers"]

    for i, batch_name in enumerate(parent_batches):
        faculty_name = elective_faculty[i % len(elective_faculty)]
        subject = Subject(
            name="Elective",
            code="ELEC500",
            credits=3,
            department_id=dept_map["UGDX"],
            batch_id=batch_map[batch_name],
            teacher_id=faculty_map[faculty_name],
        )
        db.add(subject)
        await db.flush()
        subject_count += 1
        log.info(f"  + Subject: Elective [{batch_name}] → {faculty_name}")

    # CAREER SERVICES → Parent batches
    for batch_name in parent_batches:
        subject = Subject(
            name="Career Services",
            code="CS507",
            credits=3,
            department_id=dept_map["UGDX"],
            batch_id=batch_map[batch_name],
            teacher_id=faculty_map["Firoz Shaikh"],
        )
        db.add(subject)
        await db.flush()
        subject_count += 1
        log.info(f"  + Subject: Career Services [{batch_name}] → Firoz Shaikh")

    # DEVOPS THEORY → Parent batches
    for batch_name in parent_batches:
        subject = Subject(
            name="DevOps and MLOps",
            code="DOM506",
            credits=3,
            department_id=dept_map["UGDX"],
            batch_id=batch_map[batch_name],
            teacher_id=faculty_map["Kunal Meher"],
        )
        db.add(subject)
        await db.flush()
        subject_count += 1
        log.info(f"  + Subject: DevOps and MLOps [{batch_name}] → Kunal Meher")

    # DEVOPS LAB → Lab batches
    lab_batches = [
        "SY Hadoop - Lab A",
        "SY Hadoop - Lab B",
        "SY Voyagers - Lab A",
        "SY Voyagers - Lab B",
    ]
    for lab_batch in lab_batches:
        subject = Subject(
            name="DevOps and MLOps - Lab",
            code="DOM506L",
            credits=2,
            department_id=dept_map["UGDX"],
            batch_id=batch_map[lab_batch],
            teacher_id=faculty_map["Kunal Meher"],
        )
        db.add(subject)
        await db.flush()
        subject_count += 1
        log.info(f"  + Subject: DevOps and MLOps - Lab [{lab_batch}] → Kunal Meher")

    # DATA ENGINEERING THEORY → Parent batches
    for batch_name in parent_batches:
        subject = Subject(
            name="Data Engineering Operations",
            code="DEO503",
            credits=3,
            department_id=dept_map["UGDX"],
            batch_id=batch_map[batch_name],
            teacher_id=faculty_map["Yogesh Jadhav"],
        )
        db.add(subject)
        await db.flush()
        subject_count += 1
        log.info(
            f"  + Subject: Data Engineering Operations [{batch_name}] → Yogesh Jadhav"
        )

    # DATA ENGINEERING LAB → Lab batches
    for lab_batch in lab_batches:
        subject = Subject(
            name="Data Engineering Operations - Lab",
            code="DEO503L",
            credits=2,
            department_id=dept_map["UGDX"],
            batch_id=batch_map[lab_batch],
            teacher_id=faculty_map["Yogesh Jadhav"],
        )
        db.add(subject)
        await db.flush()
        subject_count += 1
        log.info(
            f"  + Subject: Data Engineering Operations - Lab [{lab_batch}] → Yogesh Jadhav"
        )

    # ALGORITHMS → Parent batches
    for batch_name in parent_batches:
        subject = Subject(
            name="Introduction to Algorithms",
            code="ITA504",
            credits=3,
            department_id=dept_map["UGDX"],
            batch_id=batch_map[batch_name],
            teacher_id=faculty_map["Nimesh Bumb"],
        )
        db.add(subject)
        await db.flush()
        subject_count += 1
        log.info(
            f"  + Subject: Introduction to Algorithms [{batch_name}] → Nimesh Bumb"
        )

    # LARGE SCALE DATA → Parent batches
    for batch_name in parent_batches:
        subject = Subject(
            name="Large-Scale Data Storage",
            code="LDS505",
            credits=3,
            department_id=dept_map["UGDX"],
            batch_id=batch_map[batch_name],
            teacher_id=faculty_map["Sujatha Ayyengar"],
        )
        db.add(subject)
        await db.flush()
        subject_count += 1
        log.info(
            f"  + Subject: Large-Scale Data Storage [{batch_name}] → Sujatha Ayyengar"
        )

    # BUSINESS PLAN → Parent batches
    for batch_name in parent_batches:
        subject = Subject(
            name="Business Plan Writing",
            code="BPW502",
            credits=3,
            department_id=dept_map["UGDX"],
            batch_id=batch_map[batch_name],
            teacher_id=faculty_map["Shashikant Patil"],
        )
        db.add(subject)
        await db.flush()
        subject_count += 1
        log.info(
            f"  + Subject: Business Plan Writing [{batch_name}] → Shashikant Patil"
        )

    # ADVANCED ML → Parent batches
    for batch_name in parent_batches:
        subject = Subject(
            name="Advanced Machine Learning",
            code="AML501",
            credits=3,
            department_id=dept_map["UGDX"],
            batch_id=batch_map[batch_name],
            teacher_id=faculty_map["Sohel Das"],
        )
        db.add(subject)
        await db.flush()
        subject_count += 1
        log.info(f"  + Subject: Advanced Machine Learning [{batch_name}] → Sohel Das")

    log.info(f"  ✓ Created {subject_count} subjects total")


# =============================================================================
# MAIN RESET AND SEED FUNCTION
# =============================================================================


async def reset_and_seed():
    """Execute full database reset and seed with Atlas data."""
    log.info("=" * 70)
    log.info("ATLAS DATABASE RESET AND SEED")
    log.info("=" * 70)

    async with async_session_maker() as db:
        try:
            # Step 1: Clean existing data
            await clean_existing_data(db)

            # Step 2: Create departments
            dept_map = await seed_departments(db)

            # Step 3: Create faculty
            faculty_map = await seed_faculty(db, dept_map)

            # Step 4: Create batch hierarchy
            batch_map = await seed_batches(db, dept_map)

            # Step 5: Create subjects
            await seed_subjects(db, dept_map, faculty_map, batch_map)

            # Commit all changes
            await db.commit()

            log.info("=" * 70)
            log.info("✅ DATABASE RESET AND SEED COMPLETE!")
            log.info("=" * 70)
            log.info("SUMMARY:")
            log.info(f"  • Departments: {len(dept_map)}")
            log.info(f"  • Faculty: {len(faculty_map)}")
            log.info(f"  • Batches: {len(batch_map)}")
            log.info(f"  • Parent batches correctly structured")
            log.info(f"  • Lab batches linked via parent_batch_id")
            log.info(f"  • Subjects mapped correctly (theory→parent, labs→lab batches)")
            log.info(f"  • Emails consistent: @atlasskilltechuniversity.edu")
            log.info("=" * 70)

        except Exception as e:
            await db.rollback()
            log.error(f"❌ Error during seed: {e}")
            raise


# Entry point for direct execution
if __name__ == "__main__":
    asyncio.run(reset_and_seed())
