import { useState, useEffect, useRef, useCallback } from 'react'
import { useApp } from '../context/AppContext'
import { streamLesson, chat } from '../utils/api'
import { stopAllAudio, waitUntilDone } from '../hooks/useTTS'
import { MODULES } from '../data/curriculum.js'

// ---------------------------------------------------------------------------
// Streaming TTS helper — speaks sentences as they arrive from the SSE stream.
// Maintains a text buffer; whenever a sentence-ending boundary is detected
// (. ! ? followed by a space or end-of-buffer) it queues that sentence for
// the Web Speech API. Remaining partial text is held until more arrives or
// flushAll() is called.
// ---------------------------------------------------------------------------
function createStreamingTTS() {
  let buffer = ''
  let speaking = false
  const queue = []

  // Sentence-boundary regex — splits after . ! ? (optionally followed by quotes/parens)
  const BOUNDARY = /[.!?][)"']?\s+/

  function _speakNext() {
    if (speaking || queue.length === 0) return
    const text = queue.shift().trim()
    if (!text) { _speakNext(); return }

    speaking = true
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = 'hi-IN'   // change to 'en-US' or your target locale
    utter.rate = 1.0
    utter.onend = () => { speaking = false; _speakNext() }
    utter.onerror = () => { speaking = false; _speakNext() }
    window.speechSynthesis.speak(utter)
  }

  function pushChunk(chunk) {
    buffer += chunk
    // Extract complete sentences from the buffer
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
    // Called on onDone — speak whatever is left in the buffer
    if (buffer.trim()) {
      queue.push(buffer.trim())
      buffer = ''
      _speakNext()
    }
  }

  function cancel() {
    queue.length = 0
    buffer = ''
    speaking = false
    window.speechSynthesis.cancel()
  }

  return { pushChunk, flushAll, cancel }
}

// ---------------------------------------------------------------------------

export default function LessonView({ onDifficultyChange }) {
  const { sessionId, currentModule, difficultyLevel, setDifficultyLevel, tts, stt } = useApp()

  const [lessonText, setLessonText]       = useState('')
  const [isStreaming, setIsStreaming]     = useState(false)
  const [streamStatus, setStreamStatus]  = useState('')
  const [chatHistory, setChatHistory]    = useState([])
  const [isInterrupted, setIsInterrupted] = useState(false)
  const [interruptInput, setInterruptInput] = useState('')
  const [isAnswering, setIsAnswering]    = useState(false)
  const [diffBadge, setDiffBadge]        = useState(difficultyLevel)
  const [badgeAnim, setBadgeAnim]        = useState(false)

  const cancelStreamRef   = useRef(null)
  const isListeningRef    = useRef(false)
  const cancelledRef      = useRef(false)
  const lessonTextRef     = useRef('')
  const interruptInputRef = useRef(null)
  const chatEndRef        = useRef(null)
  // One streaming-TTS instance per lesson render
  const streamTTSRef      = useRef(null)

  const mod = MODULES.find(m => m.id === currentModule) || MODULES[0]

  /* ── restart lesson when module or difficulty changes ── */
  useEffect(() => {
    cancelledRef.current = true
    stopAllAudio()
    streamTTSRef.current?.cancel()
    if (cancelStreamRef.current) cancelStreamRef.current()
    setLessonText('')
    lessonTextRef.current = ''
    setChatHistory([])
    setIsInterrupted(false)
    setIsAnswering(false)
    setStreamStatus('')
    cancelledRef.current = false
    setDiffBadge(difficultyLevel)
    startLesson()
  }, [currentModule, difficultyLevel]) // eslint-disable-line

  /* ── sync badge when parent changes difficulty ── */
  useEffect(() => { setDiffBadge(difficultyLevel) }, [difficultyLevel])

  /* ── keyboard shortcuts ── */
  useEffect(() => {
    const handler = (e) => {
      const typing = ['input', 'textarea'].includes(document.activeElement?.tagName?.toLowerCase())
      if ((e.key === 'j' || e.key === 'J' || e.key === 'f' || e.key === 'F') && !typing) {
        e.preventDefault()
        if (!isListeningRef.current && !isAnswering) handleInterrupt()
      }
      if (e.key === 'Escape') {
        stopAllAudio()
        streamTTSRef.current?.cancel()
        stt.stopListening()
        isListeningRef.current = false
      }
      if ((e.key === ' ' || e.key === 'Enter') && !typing && isListeningRef.current) {
        e.preventDefault()
        stt.stopListening()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isAnswering]) // eslint-disable-line

  /* ── start / restart lesson via SSE ── */
  const startLesson = useCallback(() => {
    if (cancelledRef.current) return

    // Fresh streaming-TTS instance for this lesson
    streamTTSRef.current?.cancel()
    streamTTSRef.current = createStreamingTTS()

    setIsStreaming(true)
    setLessonText('')
    lessonTextRef.current = ''
    setStreamStatus('Lesson load ho rahi hai...')

    let accumulated = ''

    const cancel = streamLesson(sessionId, currentModule, difficultyLevel, {
      onStatus: (msg) => { setStreamStatus(msg) },

      onChunk: (chunk) => {
        if (cancelledRef.current) return
        accumulated += chunk
        setLessonText(accumulated)
        lessonTextRef.current = accumulated

        // ✅ Speak this chunk immediately — no waiting for onDone
        streamTTSRef.current?.pushChunk(chunk)
      },

      onDone: () => {
        setIsStreaming(false)
        setStreamStatus('')
        if (cancelledRef.current) return
        // Flush any trailing text that didn't end with punctuation
        streamTTSRef.current?.flushAll()
      },

      onError: () => {
        setIsStreaming(false)
        setStreamStatus('Lesson load karne mein dikkat aayi. Dobara try karo.')
      }
    })

    cancelStreamRef.current = cancel
  }, [sessionId, currentModule, difficultyLevel]) // tts removed — using streamTTSRef directly

  /* ── J/F interrupt ── */
  const handleInterrupt = useCallback(async () => {
    if (isListeningRef.current) return
    stopAllAudio()
    streamTTSRef.current?.cancel()
    cancelledRef.current = true
    isListeningRef.current = true
    setIsInterrupted(true)

    await new Promise(r => setTimeout(r, 120))
    await tts.speak('Haan bolo? Kya sawaal hai?')
    await new Promise(r => setTimeout(r, 300))

    interruptInputRef.current?.focus()

    stt.startListening(async (transcript) => {
      isListeningRef.current = false
      if (transcript?.trim()) {
        setInterruptInput('')
        await submitQuestion(transcript.trim())
      } else {
        setIsInterrupted(false)
      }
    })
  }, [tts, stt]) // eslint-disable-line

  /* ── submit question to tutor ── */
  const submitQuestion = useCallback(async (question) => {
    if (!question.trim()) return
    stopAllAudio()
    streamTTSRef.current?.cancel()
    setIsAnswering(true)
    isListeningRef.current = false

    setChatHistory(prev => [...prev, { role: 'user', content: question }])
    setInterruptInput('')
    setTimeout(() => {
      if (chatEndRef.current) chatEndRef.current.scrollTop = chatEndRef.current.scrollHeight
    }, 50)

    try {
      const result = await chat(sessionId, currentModule, question, difficultyLevel, lessonTextRef.current.slice(0, 500))
      const answer = result.response || 'Samajh nahi aaya, dobara poocho.'

      if (result.difficulty && result.difficulty !== difficultyLevel) {
        setDifficultyLevel(result.difficulty)
        setDiffBadge(result.difficulty)
        setBadgeAnim(true)
        setTimeout(() => setBadgeAnim(false), 2000)
        onDifficultyChange?.(result.difficulty)
        const diffMsg = result.difficulty === 'intermediate'
          ? 'Difficulty badh gayi — intermediate!'
          : result.difficulty === 'advanced'
          ? 'Difficulty badh gayi — advanced!'
          : 'Difficulty kam ho gayi — beginner mein wapas!'
        setChatHistory(prev => [...prev,
          { role: 'system', content: `🎯 ${diffMsg}` },
          { role: 'assistant', content: answer }
        ])
      } else {
        setChatHistory(prev => [...prev, { role: 'assistant', content: answer }])
      }

      setTimeout(() => {
        if (chatEndRef.current) chatEndRef.current.scrollTop = chatEndRef.current.scrollHeight
      }, 50)

      setIsAnswering(false)
      await new Promise(r => setTimeout(r, 800))
      await tts.speak(answer)
      await waitUntilDone(60000)

      // Resume lesson from where we left off
      setIsInterrupted(false)
      cancelledRef.current = false
      await new Promise(r => setTimeout(r, 400))
      if (!cancelledRef.current && lessonTextRef.current.trim()) {
        await tts.speak('Theek hai, lesson continue karte hain. ' + lessonTextRef.current)
      }
    } catch (err) {
      setIsAnswering(false)
      setChatHistory(prev => [...prev, { role: 'assistant', content: 'Kuch gadbad ho gayi. Dobara try karo.' }])
    }
  }, [sessionId, currentModule, difficultyLevel, tts, setDifficultyLevel, onDifficultyChange])

  const handleInterruptSubmit = useCallback(() => {
    const q = interruptInput.trim()
    if (!q) return
    stt.stopListening()
    isListeningRef.current = false
    submitQuestion(q)
  }, [interruptInput, submitQuestion, stt])

  const DIFF_COLORS = { beginner: '#4ade80', intermediate: '#a855f7', advanced: '#ec4899' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>

      {/* ── Header ── */}
      <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)',
        background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <span style={{ fontSize: '1.3rem' }} aria-hidden="true">{mod.icon}</span>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: '1.05rem',
            color: 'var(--text)', margin: 0 }}>{mod.title}</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.78rem', margin: 0 }}>
            J / F se sawaal poochho · Esc audio band karo
          </p>
        </div>

        <span
          aria-label={`Difficulty level: ${diffBadge}`}
          style={{
            background: badgeAnim ? `${DIFF_COLORS[diffBadge]}22` : 'rgba(168,85,247,0.12)',
            border: `1px solid ${badgeAnim ? DIFF_COLORS[diffBadge] : 'rgba(168,85,247,0.3)'}`,
            color: badgeAnim ? DIFF_COLORS[diffBadge] : 'var(--accent)',
            borderRadius: 20, padding: '4px 12px', fontSize: '0.78rem', fontWeight: 600,
            transition: 'all 0.5s ease',
            transform: badgeAnim ? 'scale(1.12)' : 'scale(1)'
          }}
        >
          {diffBadge}
        </span>

        {isStreaming && (
          <div className="wave-bars" aria-hidden="true">
            {[0, 1, 2, 3, 4].map(i => <div key={i} className="wave-bar" style={{ width: 3 }} />)}
          </div>
        )}
      </div>

      {/* ── Scrollable body ── */}
      <div ref={chatEndRef} style={{ flex: 1, overflowY: 'auto', padding: '24px',
        paddingBottom: isInterrupted ? '300px' : '24px', transition: 'padding-bottom 0.3s' }}
        role="region" aria-label="Lesson and conversation" aria-live="polite">

        {streamStatus && (
          <p style={{ color: 'var(--muted)', fontSize: '0.88rem', fontStyle: 'italic', marginBottom: 16 }}>
            {streamStatus}
          </p>
        )}

        {lessonText && (
          <div style={{ color: 'var(--text)', lineHeight: 2, fontSize: '1.05rem',
            fontFamily: 'DM Sans, sans-serif', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 24 }}
            aria-label="Lesson content">
            {lessonText}
            {isStreaming && <span className="cursor-blink" aria-hidden="true" />}
          </div>
        )}

        {chatHistory.length > 0 && (
          <div style={{ marginTop: 28, borderTop: '1px solid var(--border)', paddingTop: 20 }}
            role="log" aria-label="Sawaal aur jawab">
            <h3 style={{ color: 'var(--muted)', fontSize: '0.78rem', textTransform: 'uppercase',
              letterSpacing: '0.1em', marginBottom: 16 }}>Tumhare Sawaal</h3>
            {chatHistory.map((msg, i) => {
              if (msg.role === 'system') return (
                <div key={i} style={{ textAlign: 'center', margin: '12px 0' }}>
                  <span style={{ background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)',
                    borderRadius: 20, padding: '4px 14px', fontSize: '0.82rem', color: 'var(--accent)' }}>
                    {msg.content}
                  </span>
                </div>
              )
              return (
                <div key={i} style={{ marginBottom: 14, display: 'flex', flexDirection: 'column',
                  alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{ maxWidth: '85%', padding: '12px 16px',
                    borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    background: msg.role === 'user'
                      ? 'linear-gradient(135deg,rgba(168,85,247,0.25),rgba(236,72,153,0.15))'
                      : 'var(--card)',
                    border: '1px solid var(--border)', color: 'var(--text)',
                    fontSize: '0.95rem', lineHeight: 1.7 }}>
                    {msg.content}
                  </div>
                  <span style={{ color: 'var(--muted)', fontSize: '0.7rem', marginTop: 3 }}>
                    {msg.role === 'user' ? '🎙 Tumhara sawaal' : '🤖 Tutor'}
                  </span>
                </div>
              )
            })}
            {isAnswering && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: '0.88rem' }}>
                <div className="wave-bars" aria-hidden="true">
                  {[0, 1, 2].map(i => <div key={i} className="wave-bar" style={{ width: 3 }} />)}
                </div>
                Tutor soch raha hai...
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Interrupt panel ── */}
      {isInterrupted && (
        <div role="dialog" aria-label="Sawaal poochho — mic khula hai"
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
            background: 'var(--surface)', borderTop: '2px solid var(--accent)',
            padding: '18px 24px', zIndex: 10 }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
            <button
              className={stt.isListening ? 'listening-pulse' : ''}
              onClick={() => stt.isListening
                ? stt.stopListening()
                : stt.startListening(async t => {
                    if (t?.trim()) { isListeningRef.current = false; await submitQuestion(t.trim()) }
                  })
              }
              aria-label={stt.isListening ? 'Mic band karo — Space' : 'Mic shuru karo'}
              style={{ width: 60, height: 60, borderRadius: '50%', flexShrink: 0,
                background: stt.isListening
                  ? 'linear-gradient(135deg,var(--accent),var(--accent2))'
                  : 'var(--card)',
                border: stt.isListening ? 'none' : '2px solid var(--border)',
                cursor: 'pointer', fontSize: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              🎙
            </button>
            <div style={{ flex: 1 }}>
              <p style={{ color: stt.isListening ? 'var(--accent)' : 'var(--text)',
                fontWeight: 600, margin: 0, fontSize: '0.95rem' }}>
                {stt.isListening ? 'Sun raha hun... Space dabao rokne ke liye' : 'Sawaal poochho'}
              </p>
              {stt.transcript && (
                <p style={{ color: 'var(--muted)', fontSize: '0.82rem', margin: '3px 0 0', fontStyle: 'italic' }}>
                  "{stt.transcript}"
                </p>
              )}
            </div>
            <button
              onClick={() => {
                stopAllAudio()
                streamTTSRef.current?.cancel()
                stt.stopListening()
                setIsInterrupted(false)
                cancelledRef.current = false
                isListeningRef.current = false
              }}
              aria-label="Interrupt panel band karo"
              style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8,
                color: 'var(--muted)', padding: '6px 12px', cursor: 'pointer', fontSize: '0.82rem', minHeight: 44 }}>
              ✕
            </button>
          </div>

          <details>
            <summary style={{ color: 'var(--muted)', fontSize: '0.8rem', cursor: 'pointer', marginBottom: 6 }}>
              Ya text mein likho
            </summary>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input ref={interruptInputRef} type="text" value={interruptInput}
                onChange={e => setInterruptInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleInterruptSubmit()}
                placeholder="Apna sawaal yahan..." aria-label="Sawaal text mein likho"
                style={{ flex: 1, background: 'var(--card)', border: '1px solid var(--border)',
                  borderRadius: 8, color: 'var(--text)', padding: '10px 14px', fontSize: '0.92rem' }} />
              <button className="btn-primary" onClick={handleInterruptSubmit}
                disabled={!interruptInput.trim() || isAnswering}
                aria-label="Sawaal bhejo" style={{ padding: '10px 18px', fontSize: '0.88rem' }}>
                Bhejo
              </button>
            </div>
          </details>
        </div>
      )}
    </div>
  )
}