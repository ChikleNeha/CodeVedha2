import json
import re
from langchain_core.messages import HumanMessage, AIMessage
from .state import TutorState
from services.prompts import TUTOR_SYSTEM, LESSON_SYSTEM, QUIZ_SYSTEM, ROUTER_SYSTEM
from services.ollama_client import ollama_chat


def _lc_to_openai(messages: list) -> list:
    result = []
    for msg in messages:
        if hasattr(msg, "type"):
            role = "user" if msg.type == "human" else "assistant"
            result.append({"role": role, "content": msg.content})
        elif isinstance(msg, dict):
            result.append(msg)
    return result


async def router_node(state: TutorState) -> dict:
    messages = state.get("messages", [])
    if not messages:
        return {"intent": "tutor"}
    last = messages[-1]
    content = last.content if hasattr(last, "content") else str(last)
    result = await ollama_chat(ROUTER_SYSTEM, [{"role": "user", "content": content}])
    intent = result.strip().lower().split()[0] if result.strip() else "tutor"
    if intent not in ["tutor", "quiz", "lesson"]:
        intent = "tutor"
    return {"intent": intent}


async def tutor_node(state: TutorState) -> dict:
    messages = state.get("messages", [])
    difficulty = state.get("difficulty", "beginner")
    module_title = state.get("module_title", "")
    module_topics = state.get("module_topics", [])
    lesson_context = state.get("lesson_context", "")

    system = f"""{TUTOR_SYSTEM}

Current Module: {module_title}
Topics: {', '.join(module_topics)}
Difficulty: {difficulty}
Lesson Context (first 400 chars): {lesson_context[:400]}"""

    response = await ollama_chat(system, _lc_to_openai(messages))

    updated_difficulty = None
    lesson_adjustment = False

    m = re.search(r'DIFFICULTY_CHANGE:\s*(beginner|intermediate|advanced)', response)
    if m:
        updated_difficulty = m.group(1)
        response = re.sub(r'DIFFICULTY_CHANGE:\s*(beginner|intermediate|advanced)', '', response).strip()

    if 'LESSON_ADJUST: true' in response:
        lesson_adjustment = True
        response = response.replace('LESSON_ADJUST: true', '').strip()

    return {"response": response, "updated_difficulty": updated_difficulty, "lesson_adjustment": lesson_adjustment}


async def lesson_node(state: TutorState) -> dict:
    module_title = state.get("module_title", "")
    module_topics = state.get("module_topics", [])
    difficulty = state.get("difficulty", "beginner")

    system = f"""{LESSON_SYSTEM}

Module: {module_title}
Topics: {', '.join(module_topics)}
Difficulty: {difficulty}"""

    msgs = [{"role": "user", "content": f"Generate a {difficulty} level lesson for {module_title}"}]
    response = await ollama_chat(system, msgs)
    return {"response": response, "lesson_adjustment": False}


async def quiz_node(state: TutorState) -> dict:
    module_title = state.get("module_title", "")
    module_topics = state.get("module_topics", [])
    difficulty = state.get("difficulty", "beginner")

    system = f"""{QUIZ_SYSTEM}

Module: {module_title}
Topics: {', '.join(module_topics)}
Difficulty: {difficulty}"""

    msgs = [{"role": "user", "content": f"Generate 5 quiz questions for {module_title} at {difficulty} level"}]
    response = await ollama_chat(system, msgs)

    questions = []
    try:
        json_match = re.search(r'\[.*\]', response, re.DOTALL)
        if json_match:
            questions = json.loads(json_match.group())
    except Exception:
        pass

    return {"response": response, "quiz_questions": questions}
