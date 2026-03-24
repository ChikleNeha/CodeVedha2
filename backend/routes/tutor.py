import re
from fastapi import APIRouter, HTTPException
from langchain_core.messages import HumanMessage, AIMessage
from database.db import get_db
from models.schemas import TutorRequest, TutorResponse
from services.curriculum import get_module
from services.difficulty import adapt_difficulty
from graph.graph import get_graph

router = APIRouter()


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
