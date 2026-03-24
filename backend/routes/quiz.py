import json
import re
from fastapi import APIRouter, HTTPException
from database.db import get_db
from models.schemas import QuizRequest, QuizResponse, QuizQuestion, QuizResultRequest, QuizResultResponse
from services.curriculum import get_module
from services.difficulty import adapt_difficulty, get_difficulty_message
from services.prompts import QUIZ_SYSTEM
from services.ollama_client import ollama_chat

router = APIRouter()


async def _gen_quiz(module_id: int, difficulty: str) -> list:
    mod = get_module(module_id)
    if not mod:
        return []
    system = f"""{QUIZ_SYSTEM}

Module: {mod['title']}
Topics: {', '.join(mod['topics'])}
Difficulty: {difficulty}"""
    msgs = [{"role": "user", "content": f"Generate 5 quiz questions for {mod['title']} at {difficulty} level"}]
    raw = await ollama_chat(system, msgs)
    try:
        m = re.search(r'\[.*\]', raw, re.DOTALL)
        if m:
            return json.loads(m.group())
    except Exception:
        pass
    return []


@router.post("/quiz", response_model=QuizResponse)
async def get_quiz(req: QuizRequest):
    mod = get_module(req.module_id)
    if not mod:
        raise HTTPException(status_code=404, detail="Module not found")

    raw = await _gen_quiz(req.module_id, req.difficulty or "beginner")
    questions = []
    for q in raw:
        try:
            questions.append(QuizQuestion(
                question=q.get("question", ""),
                options=q.get("options", []),
                correct=int(q.get("correct", 0)),
                topic=q.get("topic", ""),
                explanation=q.get("explanation", "")
            ))
        except Exception:
            continue

    if not questions:
        questions = [QuizQuestion(
            question=f"{mod['title']} mein variable kya hota hai?",
            options=["Ek box jisme value store hoti hai", "Ek function", "Ek loop", "Ek print statement"],
            correct=0, topic="basics", explanation="Variable ek box ki tarah hota hai."
        )]

    return QuizResponse(questions=questions, module_id=req.module_id, difficulty=req.difficulty or "beginner")


@router.post("/quiz/result", response_model=QuizResultResponse)
async def submit_result(req: QuizResultRequest):
    new_diff = adapt_difficulty(req.current_difficulty or "beginner", req.score, req.total, req.wrong_topics or [])

    async with get_db() as db:
        await db.execute(
            "INSERT INTO quiz_attempts (session_id, module_id, score, total, wrong_topics) VALUES (?,?,?,?,?)",
            (req.session_id, req.module_id, req.score, req.total, json.dumps(req.wrong_topics or []))
        )
        status = "completed" if req.score >= req.total * 0.6 else "in_progress"
        await db.execute(
            """INSERT INTO progress (session_id, module_id, status, quiz_score)
               VALUES (?,?,?,?)
               ON CONFLICT(session_id, module_id) DO UPDATE SET
               status=excluded.status, quiz_score=excluded.quiz_score, updated_at=CURRENT_TIMESTAMP""",
            (req.session_id, req.module_id, status, req.score)
        )
        if new_diff and new_diff != req.current_difficulty:
            await db.execute(
                "INSERT INTO difficulty_log (session_id, module_id, old_difficulty, new_difficulty, reason) VALUES (?,?,?,?,?)",
                (req.session_id, req.module_id, req.current_difficulty, new_diff, "quiz_result")
            )
        await db.commit()

    pct = int((req.score / req.total) * 100) if req.total else 0
    if new_diff and new_diff != req.current_difficulty:
        message = get_difficulty_message(req.current_difficulty or "beginner", new_diff)
    elif pct >= 80:
        message = f"Zabardast! {pct} percent score kiya!"
    elif pct >= 60:
        message = f"Accha kiya! {pct} percent. Thodi aur practice karo."
    else:
        message = f"{pct} percent. Koi baat nahi, dobara practice karo!"

    return QuizResultResponse(new_difficulty=new_diff, changed=bool(new_diff and new_diff != req.current_difficulty), message=message)
