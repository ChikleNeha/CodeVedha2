from typing import Optional

LEVELS = ["beginner", "intermediate", "advanced"]


def adapt_difficulty(
    current: str,
    score: int,
    total: int,
    wrong_topics: list
) -> Optional[str]:
    """
    Returns new difficulty level if change needed, else None.
    score >= 80%: level up
    score < 50%: level down
    """
    if total == 0:
        return None

    percentage = (score / total) * 100
    current_idx = LEVELS.index(current) if current in LEVELS else 0

    if percentage >= 80 and current_idx < len(LEVELS) - 1:
        return LEVELS[current_idx + 1]
    elif percentage < 50 and current_idx > 0:
        return LEVELS[current_idx - 1]

    return None


def get_difficulty_message(old: str, new: str) -> str:
    if new > old:
        return f"Bahut accha! Ab hum {new} level pe ja rahe hain. Tu ready hai!"
    else:
        return f"Koi baat nahi! Pehle {new} level se aur practice karte hain."
