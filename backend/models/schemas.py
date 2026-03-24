from pydantic import BaseModel
from typing import Optional, List, Any


class UserCreate(BaseModel):
    username: str
    session_id: str


class UserResponse(BaseModel):
    username: str
    session_id: str
    created_at: Optional[str] = None


class ProgressUpdate(BaseModel):
    session_id: str
    module_id: int
    status: str
    quiz_score: Optional[int] = 0


class ProgressItem(BaseModel):
    module_id: int
    status: str
    quiz_score: int
    completed_at: Optional[str] = None
    updated_at: Optional[str] = None


class LessonRequest(BaseModel):
    session_id: str
    module_id: int
    difficulty: Optional[str] = "beginner"


class LessonResponse(BaseModel):
    content: str
    module_id: int
    difficulty: str


class TutorRequest(BaseModel):
    session_id: str
    module_id: int
    message: str
    difficulty: Optional[str] = "beginner"
    lesson_context: Optional[str] = ""


class TutorResponse(BaseModel):
    response: str
    difficulty: Optional[str] = None
    lesson_adjustment: bool = False


class QuizQuestion(BaseModel):
    question: str
    options: List[str]
    correct: int
    topic: str
    explanation: str


class QuizRequest(BaseModel):
    session_id: str
    module_id: int
    difficulty: Optional[str] = "beginner"


class QuizResponse(BaseModel):
    questions: List[QuizQuestion]
    module_id: int
    difficulty: str


class QuizResultRequest(BaseModel):
    session_id: str
    module_id: int
    score: int
    total: int
    wrong_topics: Optional[List[str]] = []
    current_difficulty: Optional[str] = "beginner"


class QuizResultResponse(BaseModel):
    new_difficulty: Optional[str] = None
    changed: bool = False
    message: str


class TTSRequest(BaseModel):
    text: str
    voice: Optional[str] = "nova"
