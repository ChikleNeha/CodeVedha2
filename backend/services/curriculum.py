from typing import Optional, Dict, Any

MODULES: Dict[int, Dict[str, Any]] = {
    1: {
        "id": 1,
        "title": "Variables aur Print",
        "description": "Variable kya hota hai, naming rules, print function, string aur number ka fark",
        "topics": [
            "variable kya hota hai",
            "naming rules",
            "print function",
            "string vs number"
        ],
        "icon": "📦",
        "estimated_minutes": 20
    },
    2: {
        "id": 2,
        "title": "Data Types",
        "description": "Integers, floats, strings, booleans aur type() function",
        "topics": [
            "integers",
            "floats",
            "strings",
            "booleans",
            "type() function"
        ],
        "icon": "🔢",
        "estimated_minutes": 25
    },
    3: {
        "id": 3,
        "title": "Conditionals",
        "description": "if, else, elif, comparison operators, nested conditions",
        "topics": [
            "if statement",
            "else statement",
            "elif statement",
            "comparison operators",
            "nested conditions"
        ],
        "icon": "🔀",
        "estimated_minutes": 30
    },
    4: {
        "id": 4,
        "title": "Loops",
        "description": "for loop, while loop, range(), break aur continue",
        "topics": [
            "for loop",
            "while loop",
            "range() function",
            "break aur continue"
        ],
        "icon": "🔄",
        "estimated_minutes": 35
    },
    5: {
        "id": 5,
        "title": "Functions",
        "description": "def, parameters, return values, functions ko call karna, default parameters",
        "topics": [
            "def keyword",
            "parameters",
            "return values",
            "functions call karna",
            "default parameters"
        ],
        "icon": "⚙️",
        "estimated_minutes": 40
    }
}


def get_module(module_id: int) -> Optional[Dict[str, Any]]:
    return MODULES.get(module_id)


def get_all_modules():
    return list(MODULES.values())
