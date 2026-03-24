from fastapi import APIRouter, HTTPException
from database.db import get_db
from models.schemas import UserCreate, UserResponse

router = APIRouter()


@router.post("/users", response_model=UserResponse)
async def create_user(user: UserCreate):
    async with get_db() as db:
        try:
            await db.execute(
                "INSERT OR IGNORE INTO users (username) VALUES (?)",
                (user.username,)
            )
            await db.execute(
                "INSERT OR REPLACE INTO sessions (session_id, username) VALUES (?, ?)",
                (user.session_id, user.username)
            )
            await db.commit()
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))

        return UserResponse(
            username=user.username,
            session_id=user.session_id
        )


@router.get("/users/{username}", response_model=UserResponse)
async def get_user(username: str):
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT username, created_at FROM users WHERE username = ?",
            (username,)
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")

        session_cursor = await db.execute(
            "SELECT session_id FROM sessions WHERE username = ? ORDER BY created_at DESC LIMIT 1",
            (username,)
        )
        session_row = await session_cursor.fetchone()
        session_id = session_row["session_id"] if session_row else ""

        return UserResponse(
            username=row["username"],
            session_id=session_id,
            created_at=str(row["created_at"])
        )
