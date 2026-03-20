from typing import List, Dict, Any
from google.ai.generativelanguage_v1beta.types import content


def get_chat_tools() -> List[content.Tool]:
    """Get list of tools available to the AI chat assistant."""

    run_schedule_optimization = content.FunctionDeclaration(
        name="run_schedule_optimization",
        description=(
            "Run the AI constraint solver to generate a university timetable. "
            "Accepts a department name (e.g. 'uGDX', 'ISME', 'ISDI', 'LAW') "
            "and resolves it to the correct department internally. "
            "Always generates for all batches in the department."
        ),
        parameters=content.Schema(
            type=content.Type.OBJECT,
            properties={
                "department_name": content.Schema(
                    type=content.Type.STRING,
                    description=(
                        "The name of the department to schedule "
                        "(e.g. 'uGDX', 'ISME'). Case-insensitive."
                    ),
                ),
            },
            required=["department_name"],
        ),
    )

    list_departments = content.FunctionDeclaration(
        name="list_departments",
        description="List all available departments and their batches.",
        parameters=content.Schema(
            type=content.Type.OBJECT,
            properties={},
        ),
    )

    return [
        content.Tool(
            function_declarations=[
                run_schedule_optimization,
                list_departments,
            ]
        )
    ]


async def execute_tool(tool_name: str, args: Dict[str, Any]) -> Dict[str, Any]:
    """Execute a tool function and return results."""

    if tool_name == "list_departments":
        try:
            from app.modules.timetable_ai.solver import (
                list_departments,
                list_batches_for_department,
            )
            from app.core.database import async_session_maker

            async with async_session_maker() as db:
                departments = await list_departments(db)
                dept_list = []
                for dept in departments:
                    batches = await list_batches_for_department(db, dept.id)
                    dept_list.append({
                        "name": dept.name,
                        "batches": [b.name for b in batches],
                    })
                return {"departments": str(dept_list)}
        except Exception as e:
            return {"error": f"Failed to list departments: {str(e)}"}

    if tool_name == "run_schedule_optimization":
        department_name = args.get("department_name", "").strip()
        if not department_name:
            return {"error": "department_name is required"}

        try:
            from app.modules.timetable_ai.solver import (
                generate_schedule,
                resolve_department,
                list_departments,
                list_batches_for_department,
            )
            from app.core.database import async_session_maker
            from app.api.telemetry import broadcast

            async with async_session_maker() as db:
                # Name → Department resolution
                dept = await resolve_department(db, department_name)

                if dept is None:
                    # Provide helpful suggestions
                    all_depts = await list_departments(db)
                    names = [d.name for d in all_depts]
                    return {
                        "error": (
                            f"Could not find a department named '{department_name}'. "
                            f"Available departments: {', '.join(names) if names else 'none'}"
                        )
                    }

                batches = await list_batches_for_department(db, dept.id)
                batch_names = [b.name for b in batches]

                # Telemetry: started
                await broadcast.broadcast({
                    "type": "task_log",
                    "agent_id": 999,
                    "agent_name": "Timetable AI",
                    "task_description": (
                        f"Generating schedule for {dept.name} "
                        f"({len(batches)} batches)"
                    ),
                    "task_status": "Running",
                })

                # Run solver
                result = await generate_schedule(db, dept.id)

            # Telemetry: finished
            is_success = result.get("status") == "SUCCESS"
            final_status = "Success" if is_success else "Failed"

            await broadcast.broadcast({
                "type": "task_log",
                "agent_id": 999,
                "agent_name": "Timetable AI",
                "task_description": (
                    f"Schedule for {dept.name}: {result.get('status')}"
                ),
                "task_status": final_status,
            })

            # Return a tiny summary (not the full schedule array)
            if is_success:
                return {
                    "status": "SUCCESS",
                    "department": dept.name,
                    "batches_scheduled": str(batch_names),
                    "slots_created": str(result.get("slots_created", 0)),
                    "message": (
                        f"Timetable generated for {dept.name} with "
                        f"{result.get('slots_created', 0)} slots across "
                        f"{len(batches)} batches. View it on the Timetable page."
                    ),
                }
            else:
                return {
                    "status": result.get("status", "FAILED"),
                    "department": dept.name,
                    "reason": result.get("reason", "Unknown error"),
                }

        except ImportError as e:
            return {"error": f"Solver module not available: {str(e)}"}
        except Exception as e:
            return {"error": f"Solver execution failed: {str(e)}"}

    return {"error": f"Unknown tool: {tool_name}"}