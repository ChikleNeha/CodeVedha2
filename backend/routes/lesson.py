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


async def _fetch_from_db(module_id: int, difficulty: str) -> str | None:
    """Fetch lesson from DB for this exact module+difficulty combo."""
    async with get_db() as db:
        row = await db.execute_fetchone(
            """SELECT content FROM lessons
               WHERE module_id = ? AND difficulty = ?
               ORDER BY created_at DESC LIMIT 1""",
            (module_id, difficulty)
        )
        return row["content"] if row else None


async def _save_to_db(session_id: str, module_id: int, difficulty: str, content: str):
    async with get_db() as db:
        await db.execute(
            "INSERT INTO lessons (session_id, module_id, difficulty, content) VALUES (?,?,?,?)",
            (session_id, module_id, difficulty, content)
        )
        await db.commit()


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


async def _get_or_generate(module_id: int, difficulty: str) -> str:
    """Memory cache → DB → generate. Only generates if not found for this difficulty."""
    cache_key = _cache_key(module_id, difficulty)

    # 1. Memory cache
    cached = _lesson_cache.get(cache_key)
    if cached and _is_valid(cached):
        return cached["content"]

    # 2. DB lookup (covers page refreshes and server restarts)
    db_content = await _fetch_from_db(module_id, difficulty)
    if db_content:
        _lesson_cache[cache_key] = {"content": db_content, "generated_at": datetime.utcnow()}
        return db_content

    # 3. Generate fresh (difficulty changed or first time)
    content = await _generate_lesson(module_id, difficulty)
    _lesson_cache[cache_key] = {"content": content, "generated_at": datetime.utcnow()}
    return content


@router.post("/lesson/stream")
async def stream_lesson(req: LessonRequest):
    mod = get_module(req.module_id)
    if not mod:
        async def err():
            yield f"data: {json.dumps({'type':'error','content':'Module not found'})}\n\n"
        return StreamingResponse(err(), media_type="text/event-stream")

    difficulty = req.difficulty or "beginner"
    cache_key = _cache_key(req.module_id, difficulty)

    async def event_gen():
        # --- Check memory cache ---
        cached = _lesson_cache.get(cache_key)
        if cached and _is_valid(cached):
            yield f"data: {json.dumps({'type':'status','content':'Lesson taiyaar hai!'})}\n\n"
            content = cached["content"]
            # Stream word-by-word so frontend TTS can consume chunks progressively
            chunk = ""
            for word in content.split(" "):
                chunk += word + " "
                if len(chunk) >= 80:
                    yield f"data: {json.dumps({'type':'chunk','content':chunk.rstrip()})}\n\n"
                    await asyncio.sleep(0.01)
                    chunk = ""
            if chunk.strip():
                yield f"data: {json.dumps({'type':'chunk','content':chunk.rstrip()})}\n\n"
            yield f"data: {json.dumps({'type':'done','module_id':req.module_id,'difficulty':difficulty})}\n\n"
            return

        # --- Check DB (difficulty-aware) ---
        db_content = await _fetch_from_db(req.module_id, difficulty)
        if db_content:
            _lesson_cache[cache_key] = {"content": db_content, "generated_at": datetime.utcnow()}
            yield f"data: {json.dumps({'type':'status','content':'Lesson mil gayi!'})}\n\n"
            chunk = ""
            for word in db_content.split(" "):
                chunk += word + " "
                if len(chunk) >= 80:
                    yield f"data: {json.dumps({'type':'chunk','content':chunk.rstrip()})}\n\n"
                    await asyncio.sleep(0.01)
                    chunk = ""
            if chunk.strip():
                yield f"data: {json.dumps({'type':'chunk','content':chunk.rstrip()})}\n\n"
            yield f"data: {json.dumps({'type':'done','module_id':req.module_id,'difficulty':difficulty})}\n\n"
            return

        # --- Not found → generate fresh (new difficulty or first run) ---
        yield f"data: {json.dumps({'type':'status','content':'AI lesson generate kar raha hai...'})}\n\n"

        system = f"""{LESSON_SYSTEM}

Module: {mod['title']}
Topics: {', '.join(mod['topics'])}
Difficulty: {difficulty}"""
        msgs = [{"role": "user", "content": f"Generate a {difficulty} level lesson for {mod['title']}"}]

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

        # Cache + save to DB
        _lesson_cache[cache_key] = {"content": full_content, "generated_at": datetime.utcnow()}
        await _save_to_db(req.session_id, req.module_id, difficulty, full_content)

        yield f"data: {json.dumps({'type':'done','module_id':req.module_id,'difficulty':difficulty})}\n\n"

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*"
        }
    )


@router.post("/lesson", response_model=LessonResponse)
async def get_lesson(req: LessonRequest):
    difficulty = req.difficulty or "beginner"
    content = await _get_or_generate(req.module_id, difficulty)
    # Persist if it was generated fresh (not already in DB)
    cache_key = _cache_key(req.module_id, difficulty)
    if not await _fetch_from_db(req.module_id, difficulty):
        await _save_to_db(req.session_id, req.module_id, difficulty, content)
    return LessonResponse(content=content, module_id=req.module_id, difficulty=difficulty)


async def _prewarm(module_id: int, difficulty: str):
    key = _cache_key(module_id, difficulty)
    if key not in _lesson_cache or not _is_valid(_lesson_cache.get(key, {})):
        content = await _get_or_generate(module_id, difficulty)
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