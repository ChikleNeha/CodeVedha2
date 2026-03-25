import re
import asyncio
import json
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage, AIMessage
from database.db import get_db
from models.schemas import TutorRequest, TutorResponse
from services.curriculum import get_module
from services.ollama_client import ollama_chat, ollama_chat_stream
from services.prompts import TUTOR_SYSTEM
from graph.graph import get_graph

router = APIRouter()

# ── helpers ────────────────────────────────────────────────────────────────

def _lc_to_openai(messages):
    result = []
    for m in messages:
        if isinstance(m, HumanMessage):
            result.append({"role": "user", "content": m.content})
        elif isinstance(m, AIMessage):
            result.append({"role": "assistant", "content": m.content})
    return result


def _extract_signals(text: str, current_difficulty: str):
    """Pull DIFFICULTY_CHANGE and LESSON_ADJUST signals out of raw LLM output."""
    updated_difficulty = None
    lesson_adjustment = False

    m = re.search(r'DIFFICULTY_CHANGE:\s*(beginner|intermediate|advanced)', text)
    if m:
        updated_difficulty = m.group(1)
        text = re.sub(r'DIFFICULTY_CHANGE:\s*(beginner|intermediate|advanced)', '', text).strip()

    if 'LESSON_ADJUST: true' in text:
        lesson_adjustment = True
        text = text.replace('LESSON_ADJUST: true', '').strip()

    return text, updated_difficulty, lesson_adjustment


async def _load_history(session_id: str, module_id: int):
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT role, content FROM messages "
            "WHERE session_id=? AND module_id=? ORDER BY timestamp ASC LIMIT 20",
            (session_id, module_id)
        )
        rows = await cursor.fetchall()
    msgs = []
    for row in rows:
        if row["role"] == "user":
            msgs.append({"role": "user", "content": row["content"]})
        else:
            msgs.append({"role": "assistant", "content": row["content"]})
    return msgs


async def save_tutor_history(req, response_text: str, updated_difficulty: str = None):
    async with get_db() as db:
        await db.execute(
            "INSERT INTO messages (session_id, module_id, role, content, message_type) VALUES (?,?,?,?,?)",
            (req.session_id, req.module_id, "user", req.message, "chat")
        )
        await db.execute(
            "INSERT INTO messages (session_id, module_id, role, content, message_type) VALUES (?,?,?,?,?)",
            (req.session_id, req.module_id, "assistant", response_text, "chat")
        )
        if updated_difficulty and updated_difficulty != req.difficulty:
            await db.execute(
                "INSERT INTO difficulty_log "
                "(session_id, module_id, old_difficulty, new_difficulty, reason) VALUES (?,?,?,?,?)",
                (req.session_id, req.module_id, req.difficulty, updated_difficulty, "mid_lesson_signal")
            )
        await db.commit()


# ── streaming endpoint ──────────────────────────────────────────────────────

@router.post("/tutor/stream")
async def stream_tutor(req: TutorRequest):
    mod = get_module(req.module_id)
    if not mod:
        async def err():
            yield f"data: {json.dumps({'type':'error','content':'Module not found'})}\n\n"
        return StreamingResponse(err(), media_type="text/event-stream")

    # Load history as plain dicts — no LangChain objects needed here
    history = await _load_history(req.session_id, req.module_id)
    history.append({"role": "user", "content": req.message})

    system = f"""{TUTOR_SYSTEM}

Current Module: {mod['title']}
Topics: {', '.join(mod['topics'])}
Difficulty: {req.difficulty or 'beginner'}
Lesson Context (first 400 chars): {(req.lesson_context or '')[:400]}"""

    async def event_gen():
        full_response = ""

        try:
            async for token in ollama_chat_stream(system, history):
                if not token:
                    continue
                full_response += token
                # Strip signals from tokens before sending to frontend
                # (signals usually appear at the end, so stream raw and clean at done)
                yield f"data: {json.dumps({'type':'chunk','content':token})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type':'error','content':str(e)})}\n\n"
            return

        # Clean signals from the full accumulated response
        clean_response, updated_difficulty, lesson_adjustment = _extract_signals(
            full_response, req.difficulty or "beginner"
        )

        # If signals were embedded mid-stream the frontend already showed them as text.
        # Fix: send a replace event so frontend can swap the raw text for the clean version.
        if clean_response != full_response:
            yield f"data: {json.dumps({'type':'replace','content':clean_response})}\n\n"

        asyncio.create_task(save_tutor_history(req, clean_response, updated_difficulty))

        yield f"data: {json.dumps({'type':'done','difficulty':updated_difficulty,'lesson_adjustment':lesson_adjustment})}\n\n"

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*",
            "Connection": "keep-alive"
        }
    )


# ── non-streaming endpoint (unchanged — still uses graph) ──────────────────

@router.post("/tutor", response_model=TutorResponse)
async def chat_with_tutor(req: TutorRequest):
    mod = get_module(req.module_id)
    if not mod:
        raise HTTPException(status_code=404, detail="Module not found")

    async with get_db() as db:
        cursor = await db.execute(
            "SELECT role, content FROM messages WHERE session_id=? AND module_id=? ORDER BY timestamp ASC LIMIT 20",
            (req.session_id, req.module_id)
        )
        rows = await cursor.fetchall()

    history = []
    for row in rows:
        if row["role"] == "user":
            history.append(HumanMessage(content=row["content"]))
        else:
            history.append(AIMessage(content=row["content"]))
    history.append(HumanMessage(content=req.message))

    graph = await get_graph()
    state = {
        "messages": history,
        "session_id": req.session_id,
        "module_id": req.module_id,
        "module_title": mod["title"],
        "module_topics": mod["topics"],
        "lesson_context": req.lesson_context or "",
        "difficulty": req.difficulty or "beginner",
        "updated_difficulty": None,
        "lesson_adjustment": False,
        "intent": "tutor",
        "response": "",
        "quiz_questions": []
    }
    config = {"configurable": {"thread_id": f"{req.session_id}:{req.module_id}"}}
    result = await graph.ainvoke(state, config=config)

    response_text = result.get("response", "")
    updated_difficulty = result.get("updated_difficulty")
    lesson_adjustment = result.get("lesson_adjustment", False)

    async with get_db() as db:
        await db.execute(
            "INSERT INTO messages (session_id, module_id, role, content, message_type) VALUES (?,?,?,?,?)",
            (req.session_id, req.module_id, "user", req.message, "chat")
        )
        await db.execute(
            "INSERT INTO messages (session_id, module_id, role, content, message_type) VALUES (?,?,?,?,?)",
            (req.session_id, req.module_id, "assistant", response_text, "chat")
        )
        if updated_difficulty and updated_difficulty != req.difficulty:
            await db.execute(
                "INSERT INTO difficulty_log (session_id, module_id, old_difficulty, new_difficulty, reason) VALUES (?,?,?,?,?)",
                (req.session_id, req.module_id, req.difficulty, updated_difficulty, "mid_lesson_signal")
            )
        await db.commit()

    return TutorResponse(response=response_text, difficulty=updated_difficulty, lesson_adjustment=lesson_adjustment)