import re
import traceback
from fastapi import APIRouter, HTTPException
from models.schemas import (
    CodeGenerateRequest, CodeGenerateResponse,
    CodeRunRequest, CodeRunResponse,
    CodeExplainRequest, CodeExplainResponse,
)
from services.prompts import CODE_TO_PYTHON_SYSTEM, CODE_OUTPUT_PREDICT_SYSTEM, ERROR_EXPLAIN_SYSTEM
from services.ollama_client import ollama_chat, OLLAMA_MODEL

router = APIRouter()

print(f"🚀 CodeTutor loaded with Ollama → {OLLAMA_MODEL}")


def _clean_code(raw: str) -> str:
    """Extract pure Python from LLM response."""
    raw = re.sub(r"```(?:python)?\s*", "", raw, flags=re.IGNORECASE)
    raw = re.sub(r"```", "", raw)
    lines = raw.splitlines()
    code_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith(("Note:", "Explanation:", "Here's", "Here is",
                                "This code", "The code", "Output:")):
            continue
        code_lines.append(line)
    return "\n".join(code_lines).strip()


@router.post("/code/generate", response_model=CodeGenerateResponse)
async def generate_code(req: CodeGenerateRequest):
    """Convert Hinglish/Hindi voice input → Python code (English strings only)."""
    if not req.audio_text or not req.audio_text.strip():
        raise HTTPException(status_code=400, detail="audio_text cannot be empty")

    user_prompt = (
        f"Instruction: {req.audio_text.strip()}\n\n"
        "Convert this to Python code. "
        "IMPORTANT: All string values and variable names in the code must be in English. "
        "Translate any Hindi or Devanagari words to their English meaning. "
        "Return ONLY the raw Python code, nothing else."
    )
    msgs = [{"role": "user", "content": user_prompt}]

    try:
        print(f"🔄 Generating code via Ollama ({OLLAMA_MODEL})...")
        print(f"📝 Input: {req.audio_text.strip()}")
        raw = await ollama_chat(CODE_TO_PYTHON_SYSTEM, msgs)
        print(f"✅ Raw: {raw[:120]}...")

    except Exception as e:
        print("❌ Ollama generation error:")
        traceback.print_exc()
        raise HTTPException(status_code=502, detail=f"Generation failed: {str(e)}")

    code = _clean_code(raw)
    if not code or len(code) < 3:
        raise HTTPException(status_code=422, detail=f"Invalid code generated. Raw: {raw[:200]}")

    return CodeGenerateResponse(code=code, speech_prompt="Python code ready hai!")


@router.post("/code/run", response_model=CodeRunResponse)
async def run_code(req: CodeRunRequest):
    """
    Ask the LLM to predict what this Python code would output.
    No subprocess — LLM simulates execution.
    """
    if not req.code or not req.code.strip():
        raise HTTPException(status_code=400, detail="code cannot be empty")

    msgs = [{"role": "user", "content": req.code.strip()}]

    try:
        print(f"🔮 Predicting output via Ollama ({OLLAMA_MODEL})...")
        prediction = await ollama_chat(CODE_OUTPUT_PREDICT_SYSTEM, msgs)
        prediction = prediction.strip()
        print(f"✅ Prediction: {prediction[:120]}")

    except Exception as e:
        print("❌ Ollama prediction error:")
        traceback.print_exc()
        raise HTTPException(status_code=502, detail=f"Prediction failed: {str(e)}")

    # Parse the LLM response into stdout/stderr/success
    if prediction.upper().startswith("ERROR:"):
        # LLM detected a code error
        error_msg = prediction[6:].strip()  # strip "ERROR: " prefix
        speech_output = f"Code mein error lag raha hai. {error_msg}"
        return CodeRunResponse(
            stdout="",
            stderr=error_msg,
            success=False,
            speech_output=speech_output,
        )
    else:
        # Either real output or a description of what the code does
        speech_output = f"Code chal gaya. Output hai: {prediction}"
        return CodeRunResponse(
            stdout=prediction,
            stderr="",
            success=True,
            speech_output=speech_output,
        )


@router.post("/code/explain-error", response_model=CodeExplainResponse)
async def explain_error(req: CodeExplainRequest):
    """Explain Python errors in Hinglish."""
    if not req.error or not req.error.strip():
        raise HTTPException(status_code=400, detail="error cannot be empty")

    prompt = (
        f"Python Code:\n{req.code}\n\n"
        f"Error Message:\n{req.error}\n\n"
        "Yeh error Hinglish mein samjhao (simple aur short, 2-3 sentences)."
    )
    msgs = [{"role": "user", "content": prompt}]

    try:
        explanation = await ollama_chat(ERROR_EXPLAIN_SYSTEM, msgs)
    except Exception as e:
        print("❌ Ollama explain-error:")
        traceback.print_exc()
        raise HTTPException(status_code=502, detail=f"Explanation failed: {str(e)}")

    return CodeExplainResponse(explanation=explanation.strip())