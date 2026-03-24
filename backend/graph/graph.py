# import os
# from langgraph.graph import StateGraph, END
# from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
# from .state import TutorState
# from .nodes import router_node, tutor_node, lesson_node, quiz_node
# from .edges import route_by_intent

# _graph = None
# _checkpointer = None

# CHECKPOINT_DB = os.path.join(os.path.dirname(__file__), "..", "database", "checkpoints.db")


# async def get_graph():
#     global _graph, _checkpointer

#     if _graph is not None:
#         return _graph

#     # FIXED ✅
#     _checkpointer = AsyncSqliteSaver.from_conn_string(CHECKPOINT_DB)

#     builder = StateGraph(TutorState)

#     builder.add_node("router_node", router_node)
#     builder.add_node("tutor_node", tutor_node)
#     builder.add_node("lesson_node", lesson_node)
#     builder.add_node("quiz_node", quiz_node)

#     builder.set_entry_point("router_node")

#     builder.add_conditional_edges(
#         "router_node",
#         route_by_intent,
#         {
#             "tutor_node": "tutor_node",
#             "lesson_node": "lesson_node",
#             "quiz_node": "quiz_node"
#         }
#     )

#     builder.add_edge("tutor_node", END)
#     builder.add_edge("lesson_node", END)
#     builder.add_edge("quiz_node", END)

#     _graph = builder.compile(checkpointer=_checkpointer)
#     return _graph


import os
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver  # ✅ Fixed: MemorySaver
from .state import TutorState
from .nodes import router_node, tutor_node, lesson_node, quiz_node
from .edges import route_by_intent

_graph = None
_checkpointer = None

CHECKPOINT_DB = os.path.join(os.path.dirname(__file__), "..", "database", "checkpoints.db")

async def get_graph():
    global _graph, _checkpointer

    if _graph is not None:
        return _graph

    # ✅ FIXED: Use MemorySaver - no DB setup needed
    _checkpointer = MemorySaver()

    builder = StateGraph(TutorState)

    builder.add_node("router_node", router_node)
    builder.add_node("tutor_node", tutor_node)
    builder.add_node("lesson_node", lesson_node)
    builder.add_node("quiz_node", quiz_node)

    builder.set_entry_point("router_node")

    builder.add_conditional_edges(
        "router_node",
        route_by_intent,
        {
            "tutor_node": "tutor_node",
            "lesson_node": "lesson_node",
            "quiz_node": "quiz_node"
        }
    )

    builder.add_edge("tutor_node", END)
    builder.add_edge("lesson_node", END)
    builder.add_edge("quiz_node", END)

    _graph = builder.compile(checkpointer=_checkpointer)
    return _graph
