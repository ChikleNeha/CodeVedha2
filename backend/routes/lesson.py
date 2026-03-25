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
    """Fetch lesson from DB — keyed on module+difficulty only (shared across all users)."""
    async with get_db() as db:
        cursor = await db.execute(
            """SELECT content FROM lessons
               WHERE module_id = ? AND difficulty = ?
               ORDER BY created_at DESC LIMIT 1""",
            (module_id, difficulty)
        )
        row = await cursor.fetchone()
        return row[0] if row else None


async def _save_to_db(module_id: int, difficulty: str, content: str):
    """Persist lesson — shared for all future users at this module+difficulty."""
    async with get_db() as db:
        await db.execute(
            """INSERT INTO lessons (module_id, difficulty, content, created_at)
               VALUES (?, ?, ?, ?)""",
            (module_id, difficulty, content, datetime.utcnow().isoformat())
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
    """Memory cache → DB → generate.
    New users always get the existing cached/DB version — no regeneration per user.
    Regeneration only happens when difficulty changes for the first time."""
    cache_key = _cache_key(module_id, difficulty)

    # 1. Memory cache
    cached = _lesson_cache.get(cache_key)
    if cached and _is_valid(cached):
        return cached["content"]

    # 2. DB (survives server restarts, shared across all users)
    db_content = await _fetch_from_db(module_id, difficulty)
    if db_content:
        _lesson_cache[cache_key] = {"content": db_content, "generated_at": datetime.utcnow()}
        return db_content

    # 3. Generate fresh — only on first run or new difficulty
    content = await _generate_lesson(module_id, difficulty)
    _lesson_cache[cache_key] = {"content": content, "generated_at": datetime.utcnow()}
    await _save_to_db(module_id, difficulty, content)
    return content


def _stream_words(content: str):
    """Yield ~80-char chunks from cached content."""
    chunk = ""
    for word in content.split(" "):
        chunk += word + " "
        if len(chunk) >= 80:
            yield chunk.rstrip()
            chunk = ""
    if chunk.strip():
        yield chunk.rstrip()


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
        # ── 1. Memory cache hit ──────────────────────────────────────────────
        cached = _lesson_cache.get(cache_key)
        if cached and _is_valid(cached):
            yield f"data: {json.dumps({'type':'status','content':'Lesson taiyaar hai!'})}\n\n"
            for chunk in _stream_words(cached["content"]):
                yield f"data: {json.dumps({'type':'chunk','content':chunk})}\n\n"
                await asyncio.sleep(0.01)
            yield f"data: {json.dumps({'type':'done','module_id':req.module_id,'difficulty':difficulty})}\n\n"
            return

        # ── 2. DB hit ────────────────────────────────────────────────────────
        db_content = await _fetch_from_db(req.module_id, difficulty)
        if db_content:
            _lesson_cache[cache_key] = {"content": db_content, "generated_at": datetime.utcnow()}
            yield f"data: {json.dumps({'type':'status','content':'Lesson mil gayi!'})}\n\n"
            for chunk in _stream_words(db_content):
                yield f"data: {json.dumps({'type':'chunk','content':chunk})}\n\n"
                await asyncio.sleep(0.01)
            yield f"data: {json.dumps({'type':'done','module_id':req.module_id,'difficulty':difficulty})}\n\n"
            return

        # ── 3. Generate fresh (new difficulty or very first run) ─────────────
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
            # Flush at sentence boundaries so TTS gets natural-sounding chunks
            if len(chunk_buf) >= 80 or (chunk_buf and chunk_buf[-1] in '.!?'):
                yield f"data: {json.dumps({'type':'chunk','content':chunk_buf})}\n\n"
                chunk_buf = ""

        if chunk_buf:
            yield f"data: {json.dumps({'type':'chunk','content':chunk_buf})}\n\n"

        # Persist — all future users share this, no regeneration
        _lesson_cache[cache_key] = {"content": full_content, "generated_at": datetime.utcnow()}
        await _save_to_db(req.module_id, difficulty, full_content)

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
    """Non-streaming endpoint — uses same shared cache, no per-user regeneration."""
    difficulty = req.difficulty or "beginner"
    content = await _get_or_generate(req.module_id, difficulty)
    return LessonResponse(content=content, module_id=req.module_id, difficulty=difficulty)


async def _prewarm(module_id: int, difficulty: str):
    key = _cache_key(module_id, difficulty)
    if _lesson_cache.get(key) and _is_valid(_lesson_cache[key]):
        return
    await _get_or_generate(module_id, difficulty)


@router.post("/lesson/prewarm")
async def prewarm_lessons(background_tasks: BackgroundTasks):
    for mid in range(2, 6):
        background_tasks.add_task(_prewarm, mid, "beginner")
    return {"status": "prewarming"}


def get_cached_lesson(module_id: int, difficulty: str) -> str | None:
    key = _cache_key(module_id, difficulty)
    cached = _lesson_cache.get(key)
    if cached and _is_valid(cached):
        return cached["content"]
    return None