import httpx
import json
import os
from dotenv import load_dotenv

load_dotenv()

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")


async def ollama_chat(system: str, messages: list, model: str = None) -> str:
    m = model or OLLAMA_MODEL
    payload = {
        "model": m,
        "stream": False,
        "messages": [{"role": "system", "content": system}] + messages,
        "options": {"num_predict": 512, "temperature": 0.7}  # ✅ Faster
    }
    async with httpx.AsyncClient(timeout=httpx.Timeout(300.0, read=240.0)) as client:  # 5min total, 4min read
        resp = await client.post(f"{OLLAMA_BASE_URL}/api/chat", json=payload)
        resp.raise_for_status()
        return resp.json()["message"]["content"].strip()


async def ollama_chat_stream(system: str, messages: list, model: str = None):
    """
    Async generator yielding text chunks from Ollama streaming.
    """
    m = model or OLLAMA_MODEL
    payload = {
        "model": m,
        "stream": True,
        "messages": [{"role": "system", "content": system}] + messages
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream("POST", f"{OLLAMA_BASE_URL}/api/chat", json=payload) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.strip():
                    continue
                try:
                    data = json.loads(line)
                    chunk = data.get("message", {}).get("content", "")
                    if chunk:
                        yield chunk
                    if data.get("done"):
                        break
                except json.JSONDecodeError:
                    continue
