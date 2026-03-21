"""Timetable AI – Constraint-programming schedule generation."""

from app.modules.timetable_ai.solver import (
    generate_schedule,
    generate_schedule_variants,
)
from .solver import generate_schedule, generate_schedule_variants

__all__ = ["generate_schedule", "generate_schedule_variants"]
