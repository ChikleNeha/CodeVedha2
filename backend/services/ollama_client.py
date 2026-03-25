import httpx
import json
from typing import List, Dict, AsyncGenerator

# Ollama runs locally — no API key needed
OLLAMA_BASE_URL = "http://localhost:11434"

# Change this to whichever model you have pulled:
#   ollama pull mistral        → "mistral"
#   ollama pull llama3.2       → "llama3.2"
#   ollama pull codellama      → "codellama"   (best for code generation)
#   ollama pull qwen2.5-coder  → "qwen2.5-coder" (also great for code)
OLLAMA_MODEL = "llama3.2"  # ← change to your pulled model name

# Explicit timeout config — local LLMs need time to generate full responses
OLLAMA_TIMEOUT = httpx.Timeout(connect=10.0, read=120.0, write=10.0, pool=10.0)


async def ollama_chat(system_instruction: str, messages: List[Dict[str, str]]) -> str:
    """
    Non-streaming Ollama call. Returns full response as a string.
    Used by: code_tutor, quiz, tutor (non-stream endpoints)
    """
    payload = {
        "model": OLLAMA_MODEL,
        "stream": False,
        "messages": [
            {"role": "system", "content": system_instruction},
            *messages,
        ],
        "options": {
            "temperature": 0.2,
            "num_predict": 1024,  # increased from 512 — prevents truncated JSON
        }
    }

    async with httpx.AsyncClient(timeout=OLLAMA_TIMEOUT) as client:
        try:
            response = await client.post(
                f"{OLLAMA_BASE_URL}/api/chat",
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
            return data["message"]["content"].strip()

        except httpx.ReadTimeout:
            raise Exception(
                "Ollama response timeout. Model generate karne mein zyada time le raha hai. "
                "Try karein: ollama pull llama3.2 (smaller model) ya num_predict kam karein."
            )
        except httpx.ConnectError:
            raise Exception(
                "Ollama se connect nahi ho paya. "
                "Kya aapne 'ollama serve' run kiya hai?"
            )
        except httpx.HTTPStatusError as e:
            raise Exception(f"Ollama HTTP error {e.response.status_code}: {e.response.text}")
        except KeyError:
            raise Exception(f"Unexpected Ollama response format: {data}")


async def ollama_chat_stream(
    system_instruction: str,
    messages: List[Dict[str, str]]
) -> AsyncGenerator[str, None]:
    """
    Streaming Ollama call. Yields text tokens one by one as they arrive.
    Used by: lesson.py stream endpoint, tutor stream endpoint.
    """
    payload = {
        "model": OLLAMA_MODEL,
        "stream": True,
        "messages": [
            {"role": "system", "content": system_instruction},
            *messages,
        ],
        "options": {
            "temperature": 0.3,
            "num_predict": 1024,
        }
    }

    async with httpx.AsyncClient(timeout=OLLAMA_TIMEOUT) as client:
        try:
            async with client.stream(
                "POST",
                f"{OLLAMA_BASE_URL}/api/chat",
                json=payload,
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        data = json.loads(line)
                        token = data.get("message", {}).get("content", "")
                        if token:
                            yield token
                        # Ollama sends {"done": true} as the last message
                        if data.get("done"):
                            break
                    except json.JSONDecodeError:
                        continue  # skip malformed lines

        except httpx.ReadTimeout:
            raise Exception(
                "Ollama stream timeout. Token generation ruk gayi. "
                "Kya Ollama abhi bhi chal raha hai?"
            )
        except httpx.ConnectError:
            raise Exception(
                "Ollama se connect nahi ho paya. "
                "Kya aapne 'ollama serve' run kiya hai?"
            )
        except httpx.HTTPStatusError as e:
            raise Exception(f"Ollama HTTP error {e.response.status_code}: {e.response.text}")