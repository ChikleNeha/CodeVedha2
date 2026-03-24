// Web Speech API TTS — replaces Bytez tts-1-hd entirely
// Hinglish: prefers hi-IN voice, falls back to en-IN, then default

let _voices = []
let _voicesLoaded = false
let _currentUtterance = null
let _isSpeakingNow = false
let _resolveWhenDone = null

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
    setTimeout(() => { _voices = window.speechSynthesis.getVoices(); _voicesLoaded = true; resolve(_voices) }, 1500)
  })
}

function pickVoice(voices) {
  return (
    voices.find(v => v.lang === 'hi-IN') ||
    voices.find(v => v.lang === 'en-IN') ||
    voices.find(v => v.lang?.startsWith('hi')) ||
    voices.find(v => v.name?.toLowerCase().includes('india')) ||
    null
  )
}

export function isSpeaking() { return _isSpeakingNow }

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

export function stopAllAudio() {
  _isSpeakingNow = false
  if (window.speechSynthesis) window.speechSynthesis.cancel()
  if (_resolveWhenDone) { _resolveWhenDone(); _resolveWhenDone = null }
}

// Split at sentence boundaries, max 200 chars (Web Speech handles longer but chunks sound more natural)
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

async function speakChunks(chunks, voice) {
  for (const chunk of chunks) {
    if (!_isSpeakingNow) break
    await new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(chunk)
      u.rate = 0.95
      u.pitch = 1.0
      u.volume = 1.0
      if (voice) u.voice = voice
      u.onend = resolve
      u.onerror = resolve
      _currentUtterance = u
      _resolveWhenDone = resolve
      window.speechSynthesis.speak(u)
    })
    _resolveWhenDone = null
  }
}

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
