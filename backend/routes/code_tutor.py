import re
import os
import google.generativeai as genai
from fastapi import APIRouter, HTTPException
from models.schemas import (
    CodeGenerateRequest, CodeGenerateResponse,
    CodeRunRequest, CodeRunResponse,
    CodeExplainRequest, CodeExplainResponse,
)
from services.code_runner import run_python_code, format_output_for_speech
from services.prompts import CODE_TO_PYTHON_SYSTEM, ERROR_EXPLAIN_SYSTEM

router = APIRouter()

# Configure Gemini API
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY environment variable is required")

genai.configure(api_key=GEMINI_API_KEY)

# ✅ WORKING MODEL NAMES (pick one)
MODEL_NAME = 'gemini-1.5-flash'  # Most reliable
model = genai.GenerativeModel(MODEL_NAME)

print(f"🚀 CodeTutor loaded with {MODEL_NAME}")


def gemini_chat(system_prompt: str, messages: list) -> str:
    """Generate content using Gemini."""
    try:
        full_prompt = f"{system_prompt}\n\n"
        for msg in messages:
            full_prompt += f"{msg['role'].title()}: {msg['content']}\n"
        
        response = model.generate_content(full_prompt)
        return response.text.strip()
        
    except Exception as e:
        print(f"❌ Gemini Error: {e}")
        raise Exception(f"Gemini failed: {str(e)}")


def _clean_code(raw: str) -> str:
    """Extract pure Python from response."""
    raw = re.sub(r"```(?:python)?\s*", "", raw, flags=re.IGNORECASE)
    raw = re.sub(r"```", "", raw)
    lines = raw.splitlines()
    code_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith(("Note:", "Explanation:", "Here's", "Here is")):
            continue
        code_lines.append(line)
    return "\n".join(code_lines).strip()


@router.post("/code/generate", response_model=CodeGenerateResponse)
async def generate_code(req: CodeGenerateRequest):
    """Generate Python from Hinglish."""
    # ✅ FIXED: Proper Python null check
    if not req.audio_text or not req.audio_text.strip():
        raise HTTPException(status_code=400, detail="audio_text cannot be empty")

    user_prompt = (
        f"Hinglish: {req.audio_text.strip()}\n\n"
        "ONLY Python code. No markdown. No explanation."
    )
    msgs = [{"role": "user", "content": user_prompt}]

    try:
        print("🔄 Generating...")
        raw = gemini_chat(CODE_TO_PYTHON_SYSTEM, msgs)
        print(f"✅ Raw: {raw[:80]}...")
        
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Generation failed: {str(e)}")

    code = _clean_code(raw)
    if not code or len(code) < 3:
        raise HTTPException(status_code=422, detail="Invalid code generated")

    speech_prompt = "Python code ready hai!"
    return CodeGenerateResponse(code=code, speech_prompt=speech_prompt)


@router.post("/code/run", response_model=CodeRunResponse)
async def run_code(req: CodeRunRequest):
    """Run Python code."""
    # ✅ FIXED: Proper Python null check
    if not req.code or not req.code.strip():
        raise HTTPException(status_code=400, detail="code cannot be empty")

    stdout, stderr, success = await run_python_code(req.code, timeout=10)
    speech_output = format_output_for_speech(stdout, stderr, success)
    
    return CodeRunResponse(
        stdout=stdout, stderr=stderr, 
        success=success, speech_output=speech_output
    )


@router.post("/code/explain-error", response_model=CodeExplainResponse)
async def explain_error(req: CodeExplainRequest):
    """Explain errors in Hinglish."""
    # ✅ FIXED: Proper Python null check
    if not req.error or not req.error.strip():
        raise HTTPException(status_code=400, detail="error cannot be empty")

    prompt = f"Code:\n{req.code}\nError: {req.error}\n\nHinglish samjhao."
    msgs = [{"role": "user", "content": prompt}]

    try:
        explanation = gemini_chat(ERROR_EXPLAIN_SYSTEM, msgs)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Explanation failed: {str(e)}")

    return CodeExplainResponse(explanation=explanation.strip())
