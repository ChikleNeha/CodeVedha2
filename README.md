# CodeVedha — Phase 1 + 2

Voice-first Python learning for visually impaired learners. Uses **Ollama (llama3.2)** + **Web Speech API**.

## Prerequisites

```bash
# Install and start Ollama
ollama pull llama3.2
ollama serve          # runs on localhost:11434
```

## Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

## Frontend

```bash
cd frontend
npm install
npm run dev           # → http://localhost:5173
```

## Demo Flow

### Phase 1
1. Visit `http://localhost:5173` → Press **Space** → Intro plays → Speak your name
2. Confirm → Navigate to Learn page
3. Lesson auto-streams in Hinglish, then spoken via Web Speech API
4. Press **J** or **F** → Ask question by voice → Get answer → Lesson resumes
5. Press **Q** → Quiz → Press **Space** → Answer with 1–4 keys → Hear feedback

### Phase 2
6. Press **X** → Code tab → Press **Space** → Say "for loop 1 se 5 tak print karo"
7. See generated Python + output · Error gets Hinglish explanation
8. Complete quiz → Difficulty badge animates to next level
9. Navigate to Module 2 → loads instantly (pre-warmed)
10. Press **P** at Module 1 → Hear progress summary

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| J / F | Interrupt lesson, open mic |
| Space | Code: mic · Quiz: start/answer |
| Enter | Confirm / submit |
| Escape | Stop all audio |
| R | Replay last audio |
| L / Q / X | Lesson / Quiz / Code tab |
| N / P | Next / Prev module (P at mod 1 = progress) |
| H | Shortcuts help |
| C | Clear code history |
| Alt+C | High contrast toggle |
| Alt+1–4 | Font size |

## Architecture

```
Ollama llama3.2 ──► LangGraph (router→tutor/lesson/quiz nodes)
                         │
Web Speech API ──► Frontend React ──► FastAPI ──► SQLite
(TTS + STT)            (Vite)       (/api/*)
                                    /api/code/run → subprocess Python
```
