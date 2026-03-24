import json
import asyncio
from datetime import datetime, timedelta
from fastapi import APIRouter, BackgroundTasks
from fastapi.responses import StreamingResponse
from database.db import get_db
from models.schemas import LessonRequest, LessonResponse
from services.curriculum import get_module
from services.prompts import LESSON_SYSTEM
from services.ollama_client import ollama_chat, ollama_chat_stream

router = APIRouter()

_lesson_cache: dict = {}
CACHE_TTL_HOURS = 24


def _cache_key(module_id: int, difficulty: str) -> str:
    return f"{module_id}:{difficulty}"


def _is_valid(entry: dict) -> bool:
    if not entry:
        return False
    return datetime.utcnow() - entry.get("generated_at", datetime.min) < timedelta(hours=CACHE_TTL_HOURS)


async def _generate_lesson(module_id: int, difficulty: str) -> str:
    mod = get_module(module_id)
    if not mod:
        return "Module nahi mila."
    system = f"""{LESSON_SYSTEM}

Module: {mod['title']}
Topics: {', '.join(mod['topics'])}
Difficulty: {difficulty}"""
    msgs = [{"role": "user", "content": f"Generate a {difficulty} level lesson for {mod['title']}"}]
    return await ollama_chat(system, msgs)


@router.post("/lesson/stream")
async def stream_lesson(req: LessonRequest):
    mod = get_module(req.module_id)
    if not mod:
        async def err():
            yield f"data: {json.dumps({'type':'error','content':'Module not found'})}\n\n"
        return StreamingResponse(err(), media_type="text/event-stream")

    cache_key = _cache_key(req.module_id, req.difficulty or "beginner")
    cached = _lesson_cache.get(cache_key)

    async def event_gen():
        # If cached, stream it word by word for smooth display
        if cached and _is_valid(cached):
            yield f"data: {json.dumps({'type':'status','content':'Lesson taiyaar hai!'})}\n\n"
            content = cached["content"]
            words = content.split(" ")
            chunk = ""
            for word in words:
                chunk += word + " "
                if len(chunk) >= 80:
                    yield f"data: {json.dumps({'type':'chunk','content':chunk.rstrip()})}\n\n"
                    await asyncio.sleep(0.01)
                    chunk = ""
            if chunk.strip():
                yield f"data: {json.dumps({'type':'chunk','content':chunk.rstrip()})}\n\n"
            yield f"data: {json.dumps({'type':'done','module_id':req.module_id,'difficulty':req.difficulty})}\n\n"
            return

        # Stream from Ollama
        yield f"data: {json.dumps({'type':'status','content':'AI lesson generate kar raha hai...'})}\n\n"

        system = f"""{LESSON_SYSTEM}

Module: {mod['title']}
Topics: {', '.join(mod['topics'])}
Difficulty: {req.difficulty or 'beginner'}"""
        msgs = [{"role": "user", "content": f"Generate a {req.difficulty or 'beginner'} level lesson for {mod['title']}"}]

        full_content = ""
        chunk_buf = ""
        async for token in ollama_chat_stream(system, msgs):
            full_content += token
            chunk_buf += token
            if len(chunk_buf) >= 80:
                yield f"data: {json.dumps({'type':'chunk','content':chunk_buf})}\n\n"
                chunk_buf = ""

        if chunk_buf:
            yield f"data: {json.dumps({'type':'chunk','content':chunk_buf})}\n\n"

        # Cache it
        _lesson_cache[cache_key] = {"content": full_content, "generated_at": datetime.utcnow()}
        async with get_db() as db:
            await db.execute(
                "INSERT INTO lessons (session_id, module_id, difficulty, content) VALUES (?,?,?,?)",
                (req.session_id, req.module_id, req.difficulty or "beginner", full_content)
            )
            await db.commit()

        yield f"data: {json.dumps({'type':'done','module_id':req.module_id,'difficulty':req.difficulty})}\n\n"

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Access-Control-Allow-Origin": "*"}
    )


@router.post("/lesson", response_model=LessonResponse)
async def get_lesson(req: LessonRequest):
    cache_key = _cache_key(req.module_id, req.difficulty or "beginner")
    cached = _lesson_cache.get(cache_key)
    if cached and _is_valid(cached):
        content = cached["content"]
    else:
        content = await _generate_lesson(req.module_id, req.difficulty or "beginner")
        _lesson_cache[cache_key] = {"content": content, "generated_at": datetime.utcnow()}
    return LessonResponse(content=content, module_id=req.module_id, difficulty=req.difficulty or "beginner")


async def _prewarm(module_id: int, difficulty: str):
    key = _cache_key(module_id, difficulty)
    if key not in _lesson_cache or not _is_valid(_lesson_cache.get(key, {})):
        content = await _generate_lesson(module_id, difficulty)
        _lesson_cache[key] = {"content": content, "generated_at": datetime.utcnow()}


@router.post("/lesson/prewarm")
async def prewarm_lessons(background_tasks: BackgroundTasks):
    for mid in range(2, 6):
        background_tasks.add_task(_prewarm, mid, "beginner")
    return {"status": "prewarming"}


def get_cached_lesson(module_id: int, difficulty: str):
    key = _cache_key(module_id, difficulty)
    cached = _lesson_cache.get(key)
    if cached and _is_valid(cached):
        return cached["content"]
    return None
