import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { createUser, prewarmLessons } from '../utils/api'

const INTRO = `Namaste! Main CodeVedha hun — tumhara Python ka doost.`

const SHORTCUTS_TEXT = `Yeh hain saare shortcuts.
Space ya Enter — mic shuru karo ya confirm karo.
R — dobara bolo.
Escape — audio band karo.
H — yeh shortcuts dobara suno.
Lesson mein: J ya F — tutor se sawaal poochho.
Ab apna naam batao — Space ya Enter dabao aur bolo.`

const PHASES = { WAIT: 'wait', LISTENING: 'listening', CONFIRM: 'confirm', DONE: 'done' }

export default function HomePage() {
  const navigate = useNavigate()
  const { sessionId, saveUsername, tts, stt } = useApp()

  const [phase, setPhase]           = useState(PHASES.WAIT)
  const [spokenName, setSpokenName] = useState('')
  const [textInput, setTextInput]   = useState('')
  const [statusMsg, setStatusMsg]   = useState('Space dabao ya button dabao')
  const mainBtnRef                  = useRef(null)
  const countdownRef                = useRef(null)
  const [countdown, setCountdown]   = useState(8)

  const spokenNameRef  = useRef('')
  const phaseRef       = useRef(PHASES.WAIT)
  const hasSpokenIntro = useRef(false) 

  const setSpokenNameBoth = (val) => { spokenNameRef.current = val; setSpokenName(val) }
  const setPhaseBoth      = (val) => { phaseRef.current = val; setPhase(val) }

  /* ── NON-BLOCKING: Combined Intro + Shortcuts (Plays Once) ── */
  useEffect(() => {
    // Accessibility: Focus the primary button immediately
    setTimeout(() => mainBtnRef.current?.focus(), 150)
    
    if (!hasSpokenIntro.current) {
      hasSpokenIntro.current = true; 
      
      // We combine them into one string so the TTS engine 
      // processes them as a single continuous queue.
      const fullWelcome = `${INTRO} ... ${SHORTCUTS_TEXT}`;
      tts.speak(fullWelcome);
    }
    
    return () => {
      // Note: We avoid tts.stop() here so React Strict Mode 
      // doesn't kill the audio on the initial double-mount.
    }
  }, [tts])

  /* ── H key: re-read shortcuts only ── */
  const speakShortcuts = useCallback(async () => {
    tts.stop()
    // Tiny timeout to ensure the hardware finishes the stop command
    await new Promise(r => setTimeout(r, 100))
    tts.speak(SHORTCUTS_TEXT)
  }, [tts])

  const startCountdown = useCallback(() => {
    setCountdown(8)
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { 
          clearInterval(countdownRef.current); 
          stt.stopListening(); 
          return 0 
        }
        return prev - 1
      })
    }, 1000)
  }, [stt])

  const handleRetry = useCallback(() => {
    clearInterval(countdownRef.current)
    tts.stop()
    stt.stopListening()
    setSpokenNameBoth('')
    setTextInput('')
    setPhaseBoth(PHASES.WAIT)
    setStatusMsg('Space dabao ya button dabao')
    setTimeout(() => mainBtnRef.current?.focus(), 100)
  }, [tts, stt])

  const handleStart = useCallback(async () => {
    if (phaseRef.current !== PHASES.WAIT) return
    
    tts.stop()
    setPhaseBoth(PHASES.LISTENING)
    setStatusMsg('Mic taiyaar kar raha hun...')
    setSpokenNameBoth('')

    setTimeout(() => {
      setStatusMsg('Naam sun raha hun...')
      stt.startListening((final) => {
        clearInterval(countdownRef.current)
        if (phaseRef.current !== PHASES.LISTENING) return
        
        const trimmed = final.trim()
        if (trimmed) {
          setSpokenNameBoth(trimmed)
          setPhaseBoth(PHASES.CONFIRM)
          setStatusMsg(`Kya tumhara naam "${trimmed}" hai?`)
          tts.speak(`Kya tumhara naam ${trimmed} hai? Confirm karne ke liye Space dabao. Dobara bolne ke liye R dabao.`)
        } else {
          setPhaseBoth(PHASES.WAIT)
          setStatusMsg('Naam sunai nahi diya. Dobara try karo.')
          setTimeout(() => mainBtnRef.current?.focus(), 100)
        }
      })
      startCountdown()
    }, 500)
  }, [tts, stt, startCountdown])

  const handleConfirm = useCallback(async () => {
    const name = spokenNameRef.current || textInput.trim()
    if (!name) return
    
    setPhaseBoth(PHASES.DONE)
    setStatusMsg('Swagat hai, ' + name + '!')
    saveUsername(name)
    
    try { await createUser(name, sessionId) } catch (e) {}
    try { prewarmLessons() } catch (e) {}
    
    await tts.speak(`Swagat hai ${name}! Chalo Python seekhte hain!`)
    navigate('/learn')
  }, [textInput, saveUsername, sessionId, tts, navigate])

  const handleTextSubmit = useCallback(() => {
    const name = textInput.trim()
    if (!name) return
    
    setSpokenNameBoth(name)
    setPhaseBoth(PHASES.CONFIRM)
    setStatusMsg(`Kya tumhara naam "${name}" hai?`)
    tts.speak(`Kya tumhara naam ${name} hai? Confirm karne ke liye Space dabao. Dobara bolne ke liye R dabao.`)
  }, [textInput, tts])

  /* ── Keyboard handler ── */
  useEffect(() => {
    const handler = (e) => {
      const typing = ['input', 'textarea'].includes(document.activeElement?.tagName?.toLowerCase())

      if ((e.key === 'h' || e.key === 'H') && !typing)                                              { e.preventDefault(); speakShortcuts(); return }
      if ((e.key === ' ' || e.key === 'Enter') && phaseRef.current === PHASES.WAIT      && !typing) { e.preventDefault(); handleStart() }
      if ((e.key === ' ' || e.key === 'Enter') && phaseRef.current === PHASES.LISTENING && !typing) { e.preventDefault(); stt.stopListening() }
      if ((e.key === ' ' || e.key === 'Enter') && phaseRef.current === PHASES.CONFIRM   && !typing) { e.preventDefault(); handleConfirm() }
      if ((e.key === 'r' || e.key === 'R')     && phaseRef.current === PHASES.CONFIRM   && !typing) { e.preventDefault(); handleRetry() }
      if (e.key === 'Escape') { tts.stop(); stt.stopListening() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleStart, handleConfirm, handleRetry, speakShortcuts, tts, stt])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden bg-[var(--ink)]">
      <a href="#main-content" className="skip-link">Main content pe jao</a>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">{statusMsg}</div>

      <div aria-hidden="true" className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(168,85,247,0.13) 0%, transparent 70%)' }} />

      <main id="main-content" className="relative z-10 flex flex-col items-center text-center px-6 w-full max-w-md">

        {/* ── Logo ── */}
        <div className="mb-10 flex flex-col items-center">
          <div className="text-7xl mb-3"
            style={{ filter: 'drop-shadow(0 0 28px rgba(168,85,247,0.55))' }}
            aria-hidden="true">🎧</div>
          <h1 className="gradient-text font-extrabold leading-tight"
            style={{ fontFamily: 'Syne, sans-serif', fontSize: 'clamp(2.4rem,8vw,3.8rem)' }}>
            CodeVedha
          </h1>
          <p className="mt-2 text-base tracking-wide" style={{ color: 'var(--muted)' }}>
            Python Seekho, Aawaz Se
          </p>
        </div>

        {/* ══════════ WAIT ══════════ */}
        {phase === PHASES.WAIT && (
          <div className="flex flex-col items-center gap-5 w-full animate-fade-in">
            <p className="text-base leading-relaxed max-w-sm" style={{ color: 'var(--text)' }}>
              Yeh platform blind aur visually impaired learners ke liye bana hai.
              Pehle shortcuts sun lo, phir naam batao!
            </p>

            <button
              ref={mainBtnRef}
              onClick={handleStart}
              className="btn-primary flex items-center gap-3 rounded-2xl"
              style={{ fontSize: '1.2rem', padding: '18px 44px', minWidth: 230 }}
              aria-label="Naam batao — Space ya Enter bhi daba sakte ho">
              🎙 <span>Naam Batao</span>
            </button>

            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              Space / Enter — mic kholo &nbsp;·&nbsp; H — shortcuts suno
            </p>

            <div className="w-full mt-1" role="group" aria-label="Ya text mein naam likho">
              <p className="text-xs mb-2" style={{ color: 'var(--muted)' }}>Ya seedha naam likho:</p>
              <div className="flex gap-2 w-full">
                <input
                  type="text"
                  value={textInput}
                  onChange={e => setTextInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleTextSubmit()}
                  placeholder="Apna naam yahan..."
                  className="flex-1 rounded-xl px-4 py-3 text-base outline-none transition-colors"
                  style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
                <button
                  className="btn-secondary rounded-xl px-4 py-3"
                  onClick={handleTextSubmit}
                  disabled={!textInput.trim()}>✓</button>
              </div>
            </div>
          </div>
        )}

        {/* ══════════ LISTENING ══════════ */}
        {phase === PHASES.LISTENING && (
          <div className="flex flex-col items-center gap-6 animate-fade-in">
            <button
              className="listening-pulse rounded-full flex items-center justify-center text-5xl"
              style={{ width: 100, height: 100, background: 'linear-gradient(135deg, var(--accent), var(--accent2))', border: 'none' }}
              onClick={() => stt.stopListening()}>
              🎙
            </button>
            <p className="text-xl font-semibold" style={{ color: 'var(--accent)' }}>
              {stt.isListening ? `Sun raha hun... ${countdown}s` : 'Taiyaar ho raha hun...'}
            </p>
            {stt.transcript && (
              <p className="text-base italic" style={{ color: 'var(--text)' }}>"{stt.transcript}"</p>
            )}
            <div className="wave-bars" aria-hidden="true">
              {[0, 1, 2, 3, 4].map(i => <div key={i} className="wave-bar" />)}
            </div>
          </div>
        )}

        {/* ══════════ CONFIRM ══════════ */}
        {phase === PHASES.CONFIRM && (
          <div className="flex flex-col items-center gap-5 w-full animate-fade-in">
            <p className="text-lg" style={{ color: 'var(--text)' }}>Kya tumhara naam yeh hai?</p>
            <p className="gradient-text font-extrabold text-4xl" style={{ fontFamily: 'Syne, sans-serif' }}>
              {spokenName || textInput}
            </p>
            <div className="flex gap-4 flex-wrap justify-center">
              <button className="btn-primary rounded-2xl" style={{ minWidth: 140, padding: '14px 32px' }} onClick={handleConfirm}>✅ Haan!</button>
              <button className="btn-secondary rounded-2xl" style={{ minWidth: 140, padding: '14px 32px' }} onClick={handleRetry}>🔄 Dobara</button>
            </div>
          </div>
        )}

        {/* ══════════ DONE ══════════ */}
        {phase === PHASES.DONE && (
          <div className="flex flex-col items-center gap-4 animate-fade-in">
            <div className="text-6xl">🎉</div>
            <p className="gradient-text font-bold text-2xl" style={{ fontFamily: 'Syne, sans-serif' }}>{statusMsg}</p>
          </div>
        )}
      </main>

      <footer className="absolute bottom-5 w-full text-center px-4 text-xs" style={{ color: 'var(--muted)' }}>
        <p>H dabao — shortcuts suno · J aur F keys mein physical bump hai — lesson mein sawaal poochho</p>
      </footer>
    </div>
  )
}