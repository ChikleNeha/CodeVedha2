from typing import TypedDict, Annotated, List, Literal, Optional
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


class TutorState(TypedDict):
    messages: Annotated[list, add_messages]
    session_id: str
    module_id: int
    module_title: str
    module_topics: List[str]
    lesson_context: str
    difficulty: str
    updated_difficulty: Optional[str]
    lesson_adjustment: bool
    intent: Literal["tutor", "quiz", "lesson", "unknown"]
    response: str
    quiz_questions: list
