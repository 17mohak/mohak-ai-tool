"""
Development Data Seeder
=======================
Populates the database with realistic demo data for development/testing.

Run via: POST /api/dev/seed
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.timetable import (
    Batch,
    DayOfWeek,
    Department,
    Room,
    Subject,
    Teacher,
)

router = APIRouter(prefix="/dev", tags=["development"])


@router.post("/seed", summary="Seed development data")
async def seed_dev(db: AsyncSession = Depends(get_db)):
    """
    Populate the database with demo data:
    - Departments: CSE, IT, ECE
    - Rooms: Classrooms and Labs
    - Batches: Theory + Lab groups
    - Teachers: 8 faculty members
    - Subjects: With credits assigned to batches
    """

    # Check if data already exists
    result = await db.execute(select(Department))
    existing = result.scalars().first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Database already seeded. Use /dev/clear first to reseed.",
        )

    # ──────────────────────────────────────────────
    # 1. DEPARTMENTS
    # ──────────────────────────────────────────────
    cse = Department(name="Computer Science and Engineering")
    it = Department(name="Information Technology")
    ece = Department(name="Electronics and Communication Engineering")

    db.add_all([cse, it, ece])
    await db.flush()  # Get IDs

    # ──────────────────────────────────────────────
    # 2. ROOMS (shared across departments)
    # ──────────────────────────────────────────────
    rooms = [
        # Classrooms
        Room(name="CR-101", capacity=60, is_lab=False),
        Room(name="CR-102", capacity=60, is_lab=False),
        Room(name="CR-201", capacity=60, is_lab=False),
        Room(name="CR-202", capacity=60, is_lab=False),
        Room(name="CR-301", capacity=60, is_lab=False),
        Room(name="CR-302", capacity=60, is_lab=False),
        # Labs
        Room(name="Lab-A1", capacity=30, is_lab=True),
        Room(name="Lab-A2", capacity=30, is_lab=True),
        Room(name="Lab-B1", capacity=30, is_lab=True),
        Room(name="Lab-B2", capacity=30, is_lab=True),
        Room(name="Lab-C1", capacity=25, is_lab=True),
        Room(name="Lab-C2", capacity=25, is_lab=True),
    ]

    db.add_all(rooms)
    await db.flush()

    # ──────────────────────────────────────────────
    # 3. TEACHERS
    # ──────────────────────────────────────────────
    teachers_cse = [
        Teacher(
            name="Dr. Rajesh Kumar",
            email="rajesh@college.edu",
            department_id=cse.id,
            max_classes_per_day=4,
        ),
        Teacher(
            name="Prof. Priya Sharma",
            email="priya@college.edu",
            department_id=cse.id,
            max_classes_per_day=4,
        ),
        Teacher(
            name="Dr. Amit Singh",
            email="amit@college.edu",
            department_id=cse.id,
            max_classes_per_day=4,
        ),
    ]

    teachers_it = [
        Teacher(
            name="Prof. Neha Gupta",
            email="neha@college.edu",
            department_id=it.id,
            max_classes_per_day=4,
        ),
        Teacher(
            name="Dr. Vikram Rao",
            email="vikram@college.edu",
            department_id=it.id,
            max_classes_per_day=4,
        ),
    ]

    teachers_ece = [
        Teacher(
            name="Dr. Suresh Patel",
            email="suresh@college.edu",
            department_id=ece.id,
            max_classes_per_day=4,
        ),
        Teacher(
            name="Prof. Anjali Desai",
            email="anjali@college.edu",
            department_id=ece.id,
            max_classes_per_day=4,
        ),
        Teacher(
            name="Dr. Ramesh Iyer",
            email="ramesh@college.edu",
            department_id=ece.id,
            max_classes_per_day=4,
        ),
    ]

    all_teachers = teachers_cse + teachers_it + teachers_ece
    db.add_all(all_teachers)
    await db.flush()

    # ──────────────────────────────────────────────
    # 4. BATCHES (CSE)
    # ──────────────────────────────────────────────
    # Parent batches (theory)
    cse_a = Batch(name="CSE-A", size=60, max_classes_per_day=6, department_id=cse.id)
    cse_b = Batch(name="CSE-B", size=60, max_classes_per_day=6, department_id=cse.id)
    db.add_all([cse_a, cse_b])
    await db.flush()

    # Sub-batches for labs (split each parent)
    cse_a1 = Batch(
        name="CSE-A1",
        size=30,
        max_classes_per_day=6,
        department_id=cse.id,
        parent_batch_id=cse_a.id,
    )
    cse_a2 = Batch(
        name="CSE-A2",
        size=30,
        max_classes_per_day=6,
        department_id=cse.id,
        parent_batch_id=cse_a.id,
    )
    cse_b1 = Batch(
        name="CSE-B1",
        size=30,
        max_classes_per_day=6,
        department_id=cse.id,
        parent_batch_id=cse_b.id,
    )
    cse_b2 = Batch(
        name="CSE-B2",
        size=30,
        max_classes_per_day=6,
        department_id=cse.id,
        parent_batch_id=cse_b.id,
    )
    db.add_all([cse_a1, cse_a2, cse_b1, cse_b2])
    await db.flush()

    # ──────────────────────────────────────────────
    # 5. BATCHES (IT)
    # ──────────────────────────────────────────────
    it_a = Batch(name="IT-A", size=60, max_classes_per_day=6, department_id=it.id)
    db.add(it_a)
    await db.flush()

    it_a1 = Batch(
        name="IT-A1",
        size=30,
        max_classes_per_day=6,
        department_id=it.id,
        parent_batch_id=it_a.id,
    )
    it_a2 = Batch(
        name="IT-A2",
        size=30,
        max_classes_per_day=6,
        department_id=it.id,
        parent_batch_id=it_a.id,
    )
    db.add_all([it_a1, it_a2])
    await db.flush()

    # ──────────────────────────────────────────────
    # 6. BATCHES (ECE)
    # ──────────────────────────────────────────────
    ece_a = Batch(name="ECE-A", size=60, max_classes_per_day=6, department_id=ece.id)
    db.add(ece_a)
    await db.flush()

    ece_a1 = Batch(
        name="ECE-A1",
        size=30,
        max_classes_per_day=6,
        department_id=ece.id,
        parent_batch_id=ece_a.id,
    )
    ece_a2 = Batch(
        name="ECE-A2",
        size=30,
        max_classes_per_day=6,
        department_id=ece.id,
        parent_batch_id=ece_a.id,
    )
    db.add_all([ece_a1, ece_a2])
    await db.flush()

    # ──────────────────────────────────────────────
    # 7. SUBJECTS (CSE)
    # ──────────────────────────────────────────────
    cse_subjects = [
        # Theory subjects for parent batches
        Subject(
            name="Data Structures",
            code="CS201",
            credits=3,
            department_id=cse.id,
            batch_id=cse_a.id,
            teacher_id=teachers_cse[0].id,
        ),
        Subject(
            name="Data Structures",
            code="CS201",
            credits=3,
            department_id=cse.id,
            batch_id=cse_b.id,
            teacher_id=teachers_cse[0].id,
        ),
        Subject(
            name="Operating Systems",
            code="CS202",
            credits=3,
            department_id=cse.id,
            batch_id=cse_a.id,
            teacher_id=teachers_cse[1].id,
        ),
        Subject(
            name="Operating Systems",
            code="CS202",
            credits=3,
            department_id=cse.id,
            batch_id=cse_b.id,
            teacher_id=teachers_cse[1].id,
        ),
        Subject(
            name="Database Management",
            code="CS203",
            credits=3,
            department_id=cse.id,
            batch_id=cse_a.id,
            teacher_id=teachers_cse[2].id,
        ),
        Subject(
            name="Database Management",
            code="CS203",
            credits=3,
            department_id=cse.id,
            batch_id=cse_b.id,
            teacher_id=teachers_cse[2].id,
        ),
        Subject(
            name="Computer Networks",
            code="CS204",
            credits=3,
            department_id=cse.id,
            batch_id=cse_a.id,
            teacher_id=teachers_cse[0].id,
        ),
        Subject(
            name="Computer Networks",
            code="CS204",
            credits=3,
            department_id=cse.id,
            batch_id=cse_b.id,
            teacher_id=teachers_cse[0].id,
        ),
        # Lab subjects for sub-batches
        Subject(
            name="DS Lab",
            code="CSL201",
            credits=2,
            department_id=cse.id,
            batch_id=cse_a1.id,
            teacher_id=teachers_cse[1].id,
        ),
        Subject(
            name="DS Lab",
            code="CSL201",
            credits=2,
            department_id=cse.id,
            batch_id=cse_a2.id,
            teacher_id=teachers_cse[1].id,
        ),
        Subject(
            name="DS Lab",
            code="CSL201",
            credits=2,
            department_id=cse.id,
            batch_id=cse_b1.id,
            teacher_id=teachers_cse[2].id,
        ),
        Subject(
            name="DS Lab",
            code="CSL201",
            credits=2,
            department_id=cse.id,
            batch_id=cse_b2.id,
            teacher_id=teachers_cse[2].id,
        ),
        Subject(
            name="OS Lab",
            code="CSL202",
            credits=2,
            department_id=cse.id,
            batch_id=cse_a1.id,
            teacher_id=teachers_cse[0].id,
        ),
        Subject(
            name="OS Lab",
            code="CSL202",
            credits=2,
            department_id=cse.id,
            batch_id=cse_a2.id,
            teacher_id=teachers_cse[0].id,
        ),
        Subject(
            name="OS Lab",
            code="CSL202",
            credits=2,
            department_id=cse.id,
            batch_id=cse_b1.id,
            teacher_id=teachers_cse[1].id,
        ),
        Subject(
            name="OS Lab",
            code="CSL202",
            credits=2,
            department_id=cse.id,
            batch_id=cse_b2.id,
            teacher_id=teachers_cse[1].id,
        ),
    ]

    # ──────────────────────────────────────────────
    # 8. SUBJECTS (IT)
    # ──────────────────────────────────────────────
    it_subjects = [
        Subject(
            name="Web Technologies",
            code="IT201",
            credits=3,
            department_id=it.id,
            batch_id=it_a.id,
            teacher_id=teachers_it[0].id,
        ),
        Subject(
            name="Software Engineering",
            code="IT202",
            credits=3,
            department_id=it.id,
            batch_id=it_a.id,
            teacher_id=teachers_it[1].id,
        ),
        Subject(
            name="Data Mining",
            code="IT203",
            credits=3,
            department_id=it.id,
            batch_id=it_a.id,
            teacher_id=teachers_it[0].id,
        ),
        # Labs
        Subject(
            name="Web Tech Lab",
            code="ITL201",
            credits=2,
            department_id=it.id,
            batch_id=it_a1.id,
            teacher_id=teachers_it[1].id,
        ),
        Subject(
            name="Web Tech Lab",
            code="ITL201",
            credits=2,
            department_id=it.id,
            batch_id=it_a2.id,
            teacher_id=teachers_it[1].id,
        ),
    ]

    # ──────────────────────────────────────────────
    # 9. SUBJECTS (ECE)
    # ──────────────────────────────────────────────
    ece_subjects = [
        Subject(
            name="Digital Electronics",
            code="EC201",
            credits=3,
            department_id=ece.id,
            batch_id=ece_a.id,
            teacher_id=teachers_ece[0].id,
        ),
        Subject(
            name="Signals and Systems",
            code="EC202",
            credits=3,
            department_id=ece.id,
            batch_id=ece_a.id,
            teacher_id=teachers_ece[1].id,
        ),
        Subject(
            name="Microprocessors",
            code="EC203",
            credits=3,
            department_id=ece.id,
            batch_id=ece_a.id,
            teacher_id=teachers_ece[2].id,
        ),
        # Labs
        Subject(
            name="Digital Lab",
            code="ECL201",
            credits=2,
            department_id=ece.id,
            batch_id=ece_a1.id,
            teacher_id=teachers_ece[0].id,
        ),
        Subject(
            name="Digital Lab",
            code="ECL201",
            credits=2,
            department_id=ece.id,
            batch_id=ece_a2.id,
            teacher_id=teachers_ece[0].id,
        ),
    ]

    db.add_all(cse_subjects + it_subjects + ece_subjects)
    await db.commit()

    # Count created entities
    result = await db.execute(select(Department))
    dept_count = len(result.scalars().all())

    result = await db.execute(select(Room))
    room_count = len(result.scalars().all())

    result = await db.execute(select(Teacher))
    teacher_count = len(result.scalars().all())

    result = await db.execute(select(Batch))
    batch_count = len(result.scalars().all())

    result = await db.execute(select(Subject))
    subject_count = len(result.scalars().all())

    return {
        "status": "seeded",
        "counts": {
            "departments": dept_count,
            "rooms": room_count,
            "teachers": teacher_count,
            "batches": batch_count,
            "subjects": subject_count,
        },
    }


@router.post("/clear", summary="Clear all timetable data")
async def clear_dev(db: AsyncSession = Depends(get_db)):
    """Remove all timetable-related data (DANGER: destructive)."""
    from app.models.timetable import (
        ScheduleSlot,
        TimetableRun,
        PinnedSlot,
        TeacherUnavailability,
    )

    # Delete in order (respect foreign keys)
    await db.execute(select(ScheduleSlot))
    await db.execute(select(TimetableRun))
    await db.execute(select(PinnedSlot))
    await db.execute(select(TeacherUnavailability))
    await db.execute(select(Subject))
    await db.execute(select(Batch))
    await db.execute(select(Teacher))
    await db.execute(select(Room))
    await db.execute(select(Department))

    # Actually delete
    await db.execute(ScheduleSlot.__table__.delete())
    await db.execute(TimetableRun.__table__.delete())
    await db.execute(PinnedSlot.__table__.delete())
    await db.execute(TeacherUnavailability.__table__.delete())
    await db.execute(Subject.__table__.delete())
    await db.execute(Batch.__table__.delete())
    await db.execute(Teacher.__table__.delete())
    await db.execute(Room.__table__.delete())
    await db.execute(Department.__table__.delete())

    await db.commit()

    return {"status": "cleared"}
