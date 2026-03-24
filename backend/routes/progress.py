from fastapi import APIRouter, HTTPException
from typing import List
from database.db import get_db
from models.schemas import ProgressUpdate, ProgressItem

router = APIRouter()


@router.get("/progress/{session_id}", response_model=List[ProgressItem])
async def get_progress(session_id: str):
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT module_id, status, quiz_score, completed_at, updated_at FROM progress WHERE session_id = ?",
            (session_id,)
        )
        rows = await cursor.fetchall()
        return [
            ProgressItem(
                module_id=row["module_id"],
                status=row["status"],
                quiz_score=row["quiz_score"] or 0,
                completed_at=str(row["completed_at"]) if row["completed_at"] else None,
                updated_at=str(row["updated_at"]) if row["updated_at"] else None
            )
            for row in rows
        ]


@router.post("/progress")
async def update_progress(update: ProgressUpdate):
    async with get_db() as db:
        completed_at_sql = "CURRENT_TIMESTAMP" if update.status == "completed" else "NULL"

        await db.execute(
            f"""INSERT INTO progress (session_id, module_id, status, quiz_score, completed_at, updated_at)
                VALUES (?, ?, ?, ?, {completed_at_sql}, CURRENT_TIMESTAMP)
                ON CONFLICT(session_id, module_id) DO UPDATE SET
                status = excluded.status,
                quiz_score = excluded.quiz_score,
                completed_at = CASE WHEN excluded.status = 'completed' THEN CURRENT_TIMESTAMP ELSE completed_at END,
                updated_at = CURRENT_TIMESTAMP""",
            (update.session_id, update.module_id, update.status, update.quiz_score or 0)
        )
        await db.commit()
        return {"success": True}
