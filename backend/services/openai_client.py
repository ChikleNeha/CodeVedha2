import os
from typing import List, Dict
from openai import AsyncOpenAI

# Configure the API Key (set OPENAI_API_KEY in your .env file)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
client = AsyncOpenAI(api_key=OPENAI_API_KEY)

async def openai_chat(system_instruction: str, messages: List[Dict[str, str]]) -> str:
    """
    Unified client for OpenAI API calls.
    Drop-in replacement for gemini_chat().
    """
    response = await client.chat.completions.create(
        model="gpt-4o-mini",  # swap to "gpt-4o" for higher quality if needed
        messages=[
            {"role": "system", "content": system_instruction},
            *messages,  # expects [{"role": "user", "content": "..."}]
        ],
        temperature=0.2,  # low temp = more deterministic code output
    )
    return response.choices[0].message.content.strip()