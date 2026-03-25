// Web Speech API TTS — Human-like Hindi + FAST (1.2x speed)
// Shared voice picker used by both useTTS and createStreamingTTS in LessonView

let _voices = []
let _voicesLoaded = false
let _isSpeakingNow = false
let _resolveWhenDone = null

// ─── Voice loading ────────────────────────────────────────────────────────────

function loadVoices() {
  if (_voicesLoaded) return Promise.resolve(_voices)
  return new Promise((resolve) => {
    const v = window.speechSynthesis.getVoices()
    if (v.length > 0) { _voices = v; _voicesLoaded = true; resolve(v); return }
    const handler = () => {
      _voices = window.speechSynthesis.getVoices()
      _voicesLoaded = true
      window.speechSynthesis.removeEventListener('voiceschanged', handler)
      resolve(_voices)
    }
    window.speechSynthesis.addEventListener('voiceschanged', handler)
    setTimeout(() => {
      if (!_voicesLoaded) {
        _voices = window.speechSynthesis.getVoices()
        _voicesLoaded = true
        resolve(_voices)
      }
    }, 1500)
  })
}

export function pickVoice(voices) {
  return (
    voices.find(v => v.lang === 'hi-IN' && v.name.toLowerCase().includes('neural')) ||
    voices.find(v => v.lang === 'hi-IN' && v.name.includes('Swati')) ||
    voices.find(v => v.lang === 'hi-IN') ||
    voices.find(v => v.lang === 'en-IN') ||
    voices.find(v => v.lang?.startsWith('hi')) ||
    voices.find(v => v.name?.toLowerCase().includes('india')) ||
    null
  )
}

// ─── Global audio controls ────────────────────────────────────────────────────

export function isSpeaking() { return _isSpeakingNow }

// ✅ NEW — lets createStreamingTTS participate in the global speaking flag
export function setSpeaking(val) { _isSpeakingNow = val }

export function stopAllAudio() {
  _isSpeakingNow = false
  if (window.speechSynthesis) window.speechSynthesis.cancel()
  if (_resolveWhenDone) { _resolveWhenDone(); _resolveWhenDone = null }
}

export async function waitUntilDone(maxMs = 60000) {
  if (!_isSpeakingNow) return
  await new Promise((resolve) => {
    const start = Date.now()
    const check = setInterval(() => {
      if (!_isSpeakingNow || Date.now() - start > maxMs) {
        clearInterval(check)
        resolve()
      }
    }, 100)
  })
}

// ─── Chunk splitting ──────────────────────────────────────────────────────────

function splitChunks(text, max = 200) {
  const sentences = text.match(/[^।.!?]+[।.!?]*/g) || [text]
  const chunks = []
  let cur = ''
  for (const s of sentences) {
    if ((cur + s).length > max && cur) { chunks.push(cur.trim()); cur = s }
    else cur += s
  }
  if (cur.trim()) chunks.push(cur.trim())
  return chunks.length ? chunks : [text]
}

// ─── Sequential chunk speaker ─────────────────────────────────────────────────

async function speakChunks(chunks, voice) {
  for (const chunk of chunks) {
    if (!_isSpeakingNow) break
    await new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(chunk)
      u.rate = 1.2
      u.pitch = 1.15
      u.volume = 0.95
      if (voice) u.voice = voice
      u.onend = () => resolve()
      u.onerror = () => resolve()
      _resolveWhenDone = resolve
      window.speechSynthesis.speak(u)
    })
    _resolveWhenDone = null
  }
}

// ─── Public hook ─────────────────────────────────────────────────────────────

export function useTTS() {
  const speak = async (text) => {
    if (!text?.trim() || !window.speechSynthesis) return
    stopAllAudio()
    await new Promise(r => setTimeout(r, 80))
    _isSpeakingNow = true
    const voices = await loadVoices()
    const voice = pickVoice(voices)
    const chunks = splitChunks(text.trim(), 200)
    await speakChunks(chunks, voice)
    _isSpeakingNow = false
  }

  const stop = () => stopAllAudio()

  return { speak, stop, isSpeaking: () => _isSpeakingNow }
}

// ─── Streaming TTS factory ────────────────────────────────────────────────────

export function createStreamingTTS() {
  let buffer = ''
  let speaking = false
  let cancelled = false
  const queue = []
  let resolvedVoice = null
  // Track if this instance has spoken anything — for global flag management
  let hasStarted = false

  loadVoices().then(voices => { resolvedVoice = pickVoice(voices) })

  const BOUNDARY = /[.!?][)"']?(\s+|$)/

  function _speakNext() {
    if (cancelled || speaking || queue.length === 0) return
    speaking = true

    // ✅ Register with global flag so waitUntilDone works correctly
    if (!hasStarted) {
      hasStarted = true
      _isSpeakingNow = true
    }

    const text = queue.shift().trim()
    if (!text) { speaking = false; _speakNext(); return }

    const u = new SpeechSynthesisUtterance(text)
    u.lang = resolvedVoice?.lang || 'hi-IN'
    u.rate = 1.2
    u.pitch = 1.15
    u.volume = 0.95
    if (resolvedVoice) u.voice = resolvedVoice

    u.onend = () => {
      speaking = false
      if (cancelled) return
      // If queue is now empty, mark global speaking as done
      if (queue.length === 0 && !buffer.trim()) {
        _isSpeakingNow = false
        if (_resolveWhenDone) { _resolveWhenDone(); _resolveWhenDone = null }
      }
      _speakNext()
    }
    u.onerror = () => {
      speaking = false
      if (!cancelled) _speakNext()
    }

    _resolveWhenDone = () => { speaking = false }
    window.speechSynthesis.speak(u)
  }

  function pushChunk(chunk) {
    if (cancelled) return
    buffer += chunk
    let match
    while ((match = BOUNDARY.exec(buffer)) !== null) {
      const sentence = buffer.slice(0, match.index + match[0].length)
      buffer = buffer.slice(sentence.length)
      if (sentence.trim()) {
        queue.push(sentence)
        _speakNext()
      }
    }
  }

  function flushAll() {
    if (cancelled) return
    if (buffer.trim()) {
      queue.push(buffer.trim())
      buffer = ''
      _speakNext()
    }
    // If nothing was ever queued (empty response), clear the global flag
    if (!hasStarted) return
    // If queue is already drained at flush time, clear flag now
    if (queue.length === 0 && !speaking) {
      _isSpeakingNow = false
    }
  }

  function cancel() {
    cancelled = true
    queue.length = 0
    buffer = ''
    speaking = false
    hasStarted = false
    _isSpeakingNow = false
    window.speechSynthesis.cancel()
  }

  return { pushChunk, flushAll, cancel }
}