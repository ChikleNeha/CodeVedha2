import os
import google.generativeai as genai
from typing import List, Dict

# Configure the API Key (Ideally set this in your .env file)
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
genai.configure(api_key=GOOGLE_API_KEY)

async def gemini_chat(system_instruction: str, messages: List[Dict[str, str]]) -> str:
    """
    Unified client for Gemini API calls.
    """
    model = genai.GenerativeModel(
        model_name="gemini-1.5-flash", # or gemini-2.0-flash
        system_instruction=system_instruction
    )
    
    # Gemini expects a different format than Ollama/OpenAI
    # We take the 'content' from the last message as the prompt
    user_prompt = messages[-1]['content']
    
    # Using generate_content for a single-turn logic (common in your endpoints)
    response = await model.generate_content_async(user_prompt)
    
    if not response.text:
        return ""
    return response.text