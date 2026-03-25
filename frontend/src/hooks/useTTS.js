// Web Speech API TTS — Fixed version
// Fixes:
//   1. Chrome 15-second silent-stop bug (keepalive interval)
//   2. speak() no longer calls stopAllAudio() internally — callers decide when to stop
//   3. speak() queues behind any in-progress speech instead of interrupting itself
//   4. Proper promise chain so sequential tts.speak() calls never overlap

let _voices       = []
let _voicesLoaded = false
let _isSpeakingNow = false
let _resolveWhenDone = null

// Chrome silently pauses speechSynthesis after ~15 seconds.
// Calling resume() on an interval keeps it alive.
let _keepAliveTimer = null

function _startKeepAlive() {
  if (_keepAliveTimer) return
  _keepAliveTimer = setInterval(() => {
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.pause()
      window.speechSynthesis.resume()
    }
  }, 10_000)
}

function _stopKeepAlive() {
  if (_keepAliveTimer) { clearInterval(_keepAliveTimer); _keepAliveTimer = null }
}

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
    voices.find(v => v.lang === 'hi-IN' && v.name.includes('Swati'))                ||
    voices.find(v => v.lang === 'hi-IN')                                             ||
    voices.find(v => v.lang === 'en-IN')                                             ||
    voices.find(v => v.lang?.startsWith('hi'))                                       ||
    voices.find(v => v.name?.toLowerCase().includes('india'))                        ||
    null
  )
}

// ─── Global audio controls ────────────────────────────────────────────────────

export function isSpeaking() { return _isSpeakingNow }
export function setSpeaking(val) { _isSpeakingNow = val }

export function stopAllAudio() {
  _isSpeakingNow = false
  _stopKeepAlive()
  if (window.speechSynthesis) window.speechSynthesis.cancel()
  // Resolve any pending waitUntilDone callers
  if (_resolveWhenDone) { _resolveWhenDone(); _resolveWhenDone = null }
}

export async function waitUntilDone(maxMs = 60000) {
  if (!_isSpeakingNow) return
  await new Promise((resolve) => {
    _resolveWhenDone = resolve
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
// Keep chunks short (≤160 chars) — long chunks are what trigger the Chrome 15s bug

function splitChunks(text, max = 160) {
  // Split on sentence boundaries first
  const sentences = text.match(/[^।.!?\n]+[।.!?\n]*/g) || [text]
  const chunks = []
  let cur = ''
  for (const s of sentences) {
    if ((cur + s).length > max && cur) {
      chunks.push(cur.trim())
      cur = s
    } else {
      cur += s
    }
  }
  if (cur.trim()) chunks.push(cur.trim())
  return chunks.length ? chunks : [text]
}

// ─── Core sequential speaker ──────────────────────────────────────────────────
// Speaks an array of chunks one-by-one. Returns a promise that resolves
// when all chunks are done OR stopAllAudio() is called.

async function speakChunks(chunks, voice) {
  for (const chunk of chunks) {
    if (!_isSpeakingNow) break   // stopAllAudio() was called — abort

    await new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(chunk)
      u.rate   = 1.15   // slightly slower than 1.2 — less likely to garble
      u.pitch  = 1.1
      u.volume = 1.0
      if (voice) u.voice = voice

      // Store resolve so stopAllAudio() can break out of this promise
      _resolveWhenDone = resolve

      u.onend   = () => { _resolveWhenDone = null; resolve() }
      u.onerror = (e) => {
        // 'interrupted' is normal when stopAllAudio() fires — not an error
        if (e.error !== 'interrupted') {
          console.warn('[TTS] utterance error:', e.error, '|', chunk.slice(0, 40))
        }
        _resolveWhenDone = null
        resolve()
      }

      window.speechSynthesis.speak(u)
    })
  }
}

// ─── Public speak queue ───────────────────────────────────────────────────────
// All speak() calls share a single promise chain so they never overlap.
// Each call waits for the previous one to fully finish before starting.

let _speakChain = Promise.resolve()

export function useTTS() {

  const speak = (text) => {
    if (!text?.trim() || !window.speechSynthesis) return Promise.resolve()

    // Chain behind whatever is currently speaking — no interruption
    _speakChain = _speakChain.then(async () => {
      if (!text?.trim()) return

      // Small gap between utterances — prevents audio clipping
      await new Promise(r => setTimeout(r, 60))

      // If something called stopAllAudio() while we were waiting, bail out
      if (!_isSpeakingNow && window.speechSynthesis.pending) return

      const voices = await loadVoices()
      const voice  = pickVoice(voices)
      const chunks = splitChunks(text.trim())

      _isSpeakingNow = true
      _startKeepAlive()

      await speakChunks(chunks, voice)

      // Only clear the flag if this chain entry was the last thing speaking
      if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
        _isSpeakingNow = false
        _stopKeepAlive()
      }
    })

    return _speakChain
  }

  // stopAndSpeak — interrupts current speech and starts fresh immediately.
  // Use this when you WANT to cut off what's playing (e.g. user pressed a key).
  const stopAndSpeak = (text) => {
    // Cancel the chain — reset to resolved so next speak() starts immediately
    _speakChain = Promise.resolve()
    stopAllAudio()
    return speak(text)
  }

  const stop = () => {
    _speakChain = Promise.resolve()
    stopAllAudio()
  }

  return {
    speak,         // queues behind current speech — for sequential narration
    stopAndSpeak,  // interrupts and speaks immediately — for user-triggered events
    stop,
    isSpeaking: () => _isSpeakingNow,
  }
}

// ─── Streaming TTS factory ────────────────────────────────────────────────────

export function createStreamingTTS() {
  let buffer    = ''
  let speaking  = false
  let cancelled = false
  const queue   = []
  let resolvedVoice = null
  let hasStarted = false

  loadVoices().then(voices => { resolvedVoice = pickVoice(voices) })

  _startKeepAlive()

  const BOUNDARY = /[.!?।][)"']?(\s+|$)/

  function _speakNext() {
    if (cancelled || speaking || queue.length === 0) return
    speaking = true

    if (!hasStarted) {
      hasStarted = true
      _isSpeakingNow = true
    }

    const text = queue.shift().trim()
    if (!text) { speaking = false; _speakNext(); return }

    const u = new SpeechSynthesisUtterance(text)
    u.lang   = resolvedVoice?.lang || 'hi-IN'
    u.rate   = 1.15
    u.pitch  = 1.1
    u.volume = 1.0
    if (resolvedVoice) u.voice = resolvedVoice

    u.onend = () => {
      speaking = false
      if (cancelled) return
      if (queue.length === 0 && !buffer.trim()) {
        _isSpeakingNow = false
        _stopKeepAlive()
        if (_resolveWhenDone) { _resolveWhenDone(); _resolveWhenDone = null }
      }
      _speakNext()
    }

    u.onerror = (e) => {
      if (e.error !== 'interrupted') {
        console.warn('[StreamTTS] error:', e.error, '|', text.slice(0, 40))
      }
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
      if (sentence.trim()) { queue.push(sentence); _speakNext() }
    }
  }

  function flushAll() {
    if (cancelled) return
    if (buffer.trim()) { queue.push(buffer.trim()); buffer = '' }
    _speakNext()
    if (!hasStarted) return
    if (queue.length === 0 && !speaking) {
      _isSpeakingNow = false
      _stopKeepAlive()
    }
  }

  function cancel() {
    cancelled  = true
    queue.length = 0
    buffer     = ''
    speaking   = false
    hasStarted = false
    _isSpeakingNow = false
    _stopKeepAlive()
    window.speechSynthesis.cancel()
  }

  return { pushChunk, flushAll, cancel }
}