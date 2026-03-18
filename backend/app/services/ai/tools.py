from typing import List, Dict, Any
from google.ai.generativelanguage_v1beta.types import content

def get_chat_tools() -> List[content.Tool]:
    """Get list of tools available to the AI chat assistant."""
    
    # ... [Keep your existing tools: get_user_info, get_system_stats, etc.] ...

    run_schedule_optimization = content.FunctionDeclaration(
        name="run_schedule_optimization",
        description="Run the AI constraint solver to generate a university timetable for a specific department.",
        parameters=content.Schema(
            type=content.Type.OBJECT,
            properties={
                "department_id": content.Schema(
                    type=content.Type.INTEGER,
                    description="The ID of the department to schedule (e.g., 1 for Computer Science)"
                )
            },
            required=["department_id"]
        )
    )
    
    return [content.Tool(function_declarations=[
        # Add your original tools here too
        run_schedule_optimization,
    ])]

async def execute_tool(tool_name: str, args: Dict[str, Any]) -> Dict[str, Any]:
    """Execute a tool function and return results."""
    
    # ... [Keep your existing tool executions] ...

    if tool_name == "run_schedule_optimization":
        department_id = args.get("department_id")
        if not department_id:
            return {"error": "department_id is required"}

        try:
            # 1. Dynamic imports to avoid circular dependency issues on startup
            from app.modules.timetable_ai.solver import generate_schedule
            from app.core.database import async_session_maker
            from app.api.telemetry import broadcast

            # 2. Fire telemetry to update the Next.js Dashboard instantly
            await broadcast.broadcast({
                "type": "task_log",
                "agent_id": 999, # Dummy ID for the UI
                "agent_name": "Timetable AI",
                "task_description": f"Generating schedule for Dept {department_id}",
                "task_status": "Running"
            })

            # 3. Spin up an async DB session and run Claude's OR-Tools Solver
            async with async_session_maker() as db:
                result = await generate_schedule(db, department_id)

            # 4. Parse the result and update the dashboard UI via WebSocket
            is_success = result.get("status") in ["SUCCESS", "OPTIMAL", "FEASIBLE"]
            final_status = "Success" if is_success else "Failed"
            
            await broadcast.broadcast({
                "type": "task_log",
                "agent_id": 999,
                "agent_name": "Timetable AI",
                "task_description": f"Schedule generation finished: {result.get('status')}",
                "task_status": final_status
            })

            return result

        except ImportError as e:
            return {"error": f"Solver module not implemented yet: {str(e)}"}
        except Exception as e:
            return {"error": f"Solver execution failed: {str(e)}"}

    else:
        return {"error": f"Unknown tool: {tool_name}"}