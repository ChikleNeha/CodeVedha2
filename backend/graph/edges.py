from .state import TutorState


def route_by_intent(state: TutorState) -> str:
    intent = state.get("intent", "tutor")
    if intent == "quiz":
        return "quiz_node"
    elif intent == "lesson":
        return "lesson_node"
    else:
        return "tutor_node"
