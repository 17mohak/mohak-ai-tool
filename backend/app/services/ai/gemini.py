from typing import Optional, List, Dict, Any
import google.generativeai as genai
from google.ai.generativelanguage_v1beta.types import content

from app.core.config import settings


class GeminiClient:
    """Client for interacting with Google's Gemini API."""

    def __init__(self):
        if settings.gemini_api_key:
            genai.configure(api_key=settings.gemini_api_key)
            self.model = genai.GenerativeModel(settings.ai_model)
        else:
            self.model = None

    def is_available(self) -> bool:
        """Check if Gemini API is configured."""
        return self.model is not None

    async def generate_text(
        self,
        prompt: str,
        system_instruction: Optional[str] = None,
        temperature: float = 0.7,
    ) -> str:
        """Generate text using Gemini."""
        if not self.is_available():
            raise ValueError("Gemini API key not configured")

        generation_config = genai.GenerationConfig(
            temperature=temperature,
            max_output_tokens=2048,
        )

        if system_instruction:
            model = genai.GenerativeModel(
                settings.ai_model,
                system_instruction=system_instruction,
            )
        else:
            model = self.model

        response = await model.generate_content_async(
            prompt,
            generation_config=generation_config,
        )
        return response.text

    async def chat(
        self,
        messages: List[Dict[str, str]],
        system_instruction: Optional[str] = None,
        tools: Optional[List[Any]] = None,
    ) -> Dict[str, Any]:
        """Chat with Gemini, optionally with function calling."""
        if not self.is_available():
            raise ValueError("Gemini API key not configured")

        model_config = {"model_name": settings.ai_model}
        
        if system_instruction:
            model_config["system_instruction"] = system_instruction
            
        if tools:
            model_config["tools"] = tools

        model = genai.GenerativeModel(**model_config)
        chat = model.start_chat()

        for msg in messages[:-1]:
            await chat.send_message_async(msg["content"])

        response = await chat.send_message_async(messages[-1]["content"])
        
        # We process function calls internally to give the model the result
        from app.services.ai.tools import execute_tool
        
        while response.candidates and response.candidates[0].content.parts and any(hasattr(p, "function_call") and getattr(p, "function_call").name for p in response.candidates[0].content.parts):
            function_responses = []
            for part in response.candidates[0].content.parts:
                if hasattr(part, "function_call") and part.function_call.name:
                    name = part.function_call.name
                    # Safely handle NoneType args for execution
                    try:
                        args = dict(part.function_call.args) if part.function_call.args else {}
                    except Exception:
                        args = {}
                        
                    tool_result = await execute_tool(name, args)
                    
                    # Safely parse output to ensure Protobuf doesn't panic on whichOneof
                    safe_dict = {}
                    if isinstance(tool_result, dict):
                        for k, v in tool_result.items():
                            if v is None: safe_dict[str(k)] = ""
                            elif isinstance(v, (str, int, float, bool)): safe_dict[str(k)] = v
                            else: safe_dict[str(k)] = str(v)
                    else:
                        safe_dict = {"result": str(tool_result)}
                        
                    function_responses.append(
                        content.Part(
                            function_response=content.FunctionResponse(
                                name=name,
                                response=safe_dict
                            )
                        )
                    )
            
            # Send the safe array of FunctionResponses back to the model!
            response = await chat.send_message_async(function_responses)

        result = {
            "content": response.text if hasattr(response, "text") and response.text else "",
            "function_calls": [], # Deprecated in favor of internal loop execution
        }

        return result


gemini_client = GeminiClient()
