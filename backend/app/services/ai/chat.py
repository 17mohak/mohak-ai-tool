from typing import List, Dict, Any, Optional
from app.services.ai.gemini import gemini_client
from app.services.ai.tools import get_chat_tools, execute_tool


class ChatService:
    """Service for AI Manager chat functionality."""

    SYSTEM_INSTRUCTION = """You are the Atlas AI Manager, an intelligent assistant for the Atlas Smart Class Scheduler.

Your capabilities:
- Help users understand system status and metrics
- Assist with user management and access control
- Explain policies and create new ones
- Search and analyze audit logs
- Provide insights and recommendations
- Answer questions about the platform
- Generate class timetables for departments by name (e.g. "uGDX", "ISME", "ISDI", "LAW")
- List available departments and their batches

IMPORTANT RULES:
- When a user asks to generate a timetable, use their department NAME to call the run_schedule_optimization tool.
- NEVER ask for a numeric department ID. Always accept department names.
- If unsure which department the user means, call list_departments to show options.
- After generating a timetable, tell the user to visit the Timetable page to view it.

Current context:
- User: {user_email} ({user_role})
- Page: {current_page}

Be helpful, concise, and proactive. Use available tools when needed. If you don't have enough information, ask clarifying questions."""

    async def chat(
        self,
        messages: List[Dict[str, str]],
        user_email: str,
        user_role: str,
        current_page: str = "/",
    ) -> Dict[str, Any]:
        """Process a chat message and return response."""
        
        if not gemini_client.is_available():
            return {
                "role": "assistant",
                "content": "AI Manager is currently unavailable. Please configure the GEMINI_API_KEY to enable AI features.",
                "tool_calls": []
            }

        system_instruction = self.SYSTEM_INSTRUCTION.format(
            user_email=user_email,
            user_role=user_role,
            current_page=current_page,
        )

        try:
            tools = get_chat_tools()
            response = await gemini_client.chat(
                messages=messages,
                system_instruction=system_instruction,
                tools=tools,
            )

            # Execute any function calls
            tool_results = []
            for func_call in response.get("function_calls", []):
                result = await execute_tool(func_call["name"], func_call["args"])
                tool_results.append({
                    "tool": func_call["name"],
                    "result": result
                })

            content = response.get("content", "") or ""

            # Fallback: if Gemini returned no text but tools ran, build a
            # short summary so the frontend never receives an empty bubble.
            if not content.strip() and tool_results:
                summaries = []
                for tr in tool_results:
                    tool_name = tr["tool"]
                    res = tr["result"]
                    if isinstance(res, dict) and res.get("error"):
                        summaries.append(f"**{tool_name}** — ⚠️ {res['error']}")
                    elif isinstance(res, dict) and res.get("status"):
                        summaries.append(
                            f"**{tool_name}** — {res['status']}"
                        )
                    else:
                        summaries.append(f"**{tool_name}** — completed")
                content = (
                    "I ran the following actions:\n\n"
                    + "\n".join(f"• {s}" for s in summaries)
                    + "\n\nLet me know if you need anything else!"
                )
            elif not content.strip():
                content = (
                    "I wasn't able to generate a response this time. "
                    "Please try rephrasing your question."
                )

            return {
                "role": "assistant",
                "content": content,
                "tool_calls": tool_results,
            }

        except Exception as e:
            return {
                "role": "assistant",
                "content": f"I encountered an error: {str(e)}. Please try again.",
                "tool_calls": []
            }


chat_service = ChatService()
