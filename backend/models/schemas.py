from pydantic import BaseModel
from typing import Optional, List, Any, Literal


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

class StreamingTutorResponse(BaseModel):
    type: Literal["chunk", "done", "difficulty", "adjustment"]
    content: Optional[str] = None
    difficulty: Optional[str] = None
    lesson_adjustment: Optional[bool] = None



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


# Add these classes to your existing schemas.py

from pydantic import BaseModel
from typing import Optional


class CodeGenerateRequest(BaseModel):
    session_id: str
    audio_text: str          # transcribed speech from the user
    module_id: Optional[int] = None
    difficulty: Optional[str] = "beginner"


class CodeGenerateResponse(BaseModel):
    code: str                # raw executable Python code
    speech_prompt: str       # what to speak before showing/running code


class CodeRunRequest(BaseModel):
    session_id: str
    code: str                # Python code to execute


class CodeRunResponse(BaseModel):
    stdout: str
    stderr: str
    success: bool
    speech_output: str       # TTS-ready Hinglish summary of result


class CodeExplainRequest(BaseModel):
    session_id: str
    code: str
    error: str               # the stderr / error message


class CodeExplainResponse(BaseModel):
    explanation: str         # plain Hinglish, no markdown, screen-reader safe