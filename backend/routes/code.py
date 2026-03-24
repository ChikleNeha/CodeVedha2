import subprocess
import sys
import asyncio
from fastapi import APIRouter
from pydantic import BaseModel
from services.prompts import CODE_TO_PYTHON_SYSTEM, ERROR_EXPLAIN_SYSTEM
from services.ollama_client import ollama_chat

router = APIRouter()


class CodeRunRequest(BaseModel):
    spoken_text: str
    current_module: int = 1


class CodeRunResponse(BaseModel):
    code: str
    output: str
    error: str
    error_explanation: str
    success: bool


@router.post("/code/run", response_model=CodeRunResponse)
async def run_code(req: CodeRunRequest):
    # Step 1: Convert Hinglish speech to Python
    msgs = [{"role": "user", "content": req.spoken_text}]
    code = await ollama_chat(CODE_TO_PYTHON_SYSTEM, msgs)

    # Clean up: strip markdown fences if LLM added them
    code = code.strip()
    if code.startswith("```"):
        lines = code.split("\n")
        # Remove first and last fence lines
        code = "\n".join(
            line for line in lines
            if not line.strip().startswith("```")
        ).strip()

    # Step 2: Execute with subprocess, 5s timeout
    output = ""
    error = ""
    success = False
    try:
        proc = await asyncio.wait_for(
            asyncio.create_subprocess_exec(
                sys.executable, "-c", code,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            ),
            timeout=5.0
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=5.0)
        output = stdout.decode("utf-8", errors="replace").strip()
        error = stderr.decode("utf-8", errors="replace").strip()
        success = proc.returncode == 0 and not error
    except asyncio.TimeoutError:
        error = "TimeoutError: Code 5 seconds mein complete nahi hua."
        success = False
    except Exception as e:
        error = str(e)
        success = False

    # Step 3: If error, explain in Hinglish
    error_explanation = ""
    if error:
        try:
            explain_msgs = [{"role": "user", "content": f"Code:\n{code}\n\nError:\n{error}"}]
            error_explanation = await ollama_chat(ERROR_EXPLAIN_SYSTEM, explain_msgs)
        except Exception:
            error_explanation = "Code mein kuch problem hai. Dobara try karo."

    return CodeRunResponse(
        code=code,
        output=output,
        error=error,
        error_explanation=error_explanation,
        success=success
    )
