import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

export const createUser = (username, session_id) =>
  api.post('/users', { username, session_id }).then(r => r.data)

export const getUser = (username) =>
  api.get(`/users/${username}`).then(r => r.data)

export const getProgress = (session_id) =>
  api.get(`/progress/${session_id}`).then(r => r.data)

export const updateProgress = (data) =>
  api.post('/progress', data).then(r => r.data)

export const getLesson = (session_id, module_id, difficulty = 'beginner') =>
  api.post('/lesson', { session_id, module_id, difficulty }).then(r => r.data)

export const prewarmLessons = () =>
  api.post('/lesson/prewarm').then(r => r.data)

export function streamLesson(session_id, module_id, difficulty, { onStatus, onChunk, onDone, onError }) {
  const ctrl = new AbortController()
  fetch('/api/lesson/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id, module_id, difficulty }),
    signal: ctrl.signal
  }).then(async (res) => {
    if (!res.ok) throw new Error('Stream failed')
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() || ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const raw = line.slice(6).trim()
        if (!raw) continue
        try {
          const ev = JSON.parse(raw)
          if (ev.type === 'status') onStatus?.(ev.content)
          if (ev.type === 'chunk') onChunk?.(ev.content)
          if (ev.type === 'done') onDone?.(ev)
          if (ev.type === 'error') onError?.(ev.content)
        } catch (e) {}
      }
    }
  }).catch(err => { if (err.name !== 'AbortError') onError?.(err.message) })
  return () => ctrl.abort()
}

export const chat = (session_id, module_id, message, difficulty, lesson_context) =>
  api.post('/tutor', { session_id, module_id, message, difficulty, lesson_context }).then(r => r.data)

export const getQuiz = (session_id, module_id, difficulty = 'beginner') =>
  api.post('/quiz', { session_id, module_id, difficulty }).then(r => r.data)

export const submitQuizResult = (data) =>
  api.post('/quiz/result', data).then(r => r.data)

// Step 1: convert spoken text → Python code
// Step 2: run that code and return combined result
export const runCode = async (spoken_text, current_module) => {
  // Generate code from spoken text
  const generated = await api.post('/code/generate', {
    session_id: 'frontend',
    audio_text: spoken_text,
    module_id: current_module?.id ?? null,
  }).then(r => r.data)

  // Run the generated code
  const result = await api.post('/code/run', {
    session_id: 'frontend',
    code: generated.code,
  }).then(r => r.data)

  // If there was an error, get a Hinglish explanation
  let error_explanation = ''
  if (!result.success && result.stderr) {
    const explained = await api.post('/code/explain-error', {
      session_id: 'frontend',
      code: generated.code,
      error: result.stderr,
    }).then(r => r.data).catch(() => ({ explanation: '' }))
    error_explanation = explained.explanation
  }

  // Return shape that CodeView.jsx already expects
  return {
    code: generated.code,
    output: result.stdout,
    error: result.stderr,
    error_explanation,
    success: result.success,
    speech_output: result.speech_output,
  }
}