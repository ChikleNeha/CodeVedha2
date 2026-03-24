from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from database.db import init_db
from routes import users, progress, lesson, tutor, quiz, tts, stt
from routes.code_tutor import router as code_tutor_router



@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="CodeVedha API", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

app.include_router(users.router, prefix="/api")
app.include_router(progress.router, prefix="/api")
app.include_router(lesson.router, prefix="/api")
app.include_router(tutor.router, prefix="/api")
app.include_router(quiz.router, prefix="/api")
app.include_router(tts.router, prefix="/api")
app.include_router(stt.router, prefix="/api")
# app.include_router(code.router, prefix="/api")
app.include_router(code_tutor_router, prefix="/api")


@app.get("/")
async def root():
    return {"message": "CodeVedha API v2", "status": "ok"}

@app.get("/health")
async def health():
    return {"status": "healthy"}
