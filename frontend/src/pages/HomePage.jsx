import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { createUser, prewarmLessons } from '../utils/api'

const INTRO = `Namaste! Main CodeVedha hun — tumhara Python ka doost. Apna naam batao!`
const PHASES = { WAIT: 'wait', LISTENING: 'listening', CONFIRM: 'confirm', DONE: 'done' }

export default function HomePage() {
  const navigate = useNavigate()
  const { sessionId, saveUsername, tts, stt } = useApp()

  const [phase, setPhase] = useState(PHASES.WAIT)
  const [spokenName, setSpokenName] = useState('')
  const [textInput, setTextInput] = useState('')
  const [statusMsg, setStatusMsg] = useState('Space dabao ya button dabao')
  const mainBtnRef = useRef(null)
  const countdownRef = useRef(null)
  const [countdown, setCountdown] = useState(8)

  useEffect(() => { setTimeout(() => mainBtnRef.current?.focus(), 150) }, [])

  useEffect(() => {
    const handler = (e) => {
      if ((e.key === ' ' || e.key === 'Enter') && phase === PHASES.WAIT) { e.preventDefault(); handleStart() }
      if ((e.key === ' ' || e.key === 'Enter') && phase === PHASES.LISTENING) { e.preventDefault(); stt.stopListening() }
      if ((e.key === ' ' || e.key === 'Enter') && phase === PHASES.CONFIRM) { e.preventDefault(); handleConfirm() }
      if (e.key === 'Escape') { tts.stop(); stt.stopListening() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [phase, spokenName, textInput])

  const startCountdown = useCallback(() => {
    setCountdown(8)
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(countdownRef.current); stt.stopListening(); return 0 }
        return prev - 1
      })
    }, 1000)
  }, [stt])

  const handleStart = useCallback(async () => {
    setPhase(PHASES.LISTENING)
    setStatusMsg('Naam bol raha hai...')
    // Speak intro then open mic
    await tts.speak(INTRO)
    await new Promise(r => setTimeout(r, 200))
    stt.startListening((final) => {
      clearInterval(countdownRef.current)
      if (final.trim()) {
        setSpokenName(final.trim())
        setPhase(PHASES.CONFIRM)
        setStatusMsg(`Kya tumhara naam "${final.trim()}" hai?`)
        tts.speak(`Kya tumhara naam ${final.trim()} hai? Confirm karne ke liye Space dabao.`)
      } else {
        setPhase(PHASES.WAIT)
        setStatusMsg('Naam sunai nahi diya. Dobara try karo.')
        setTimeout(() => mainBtnRef.current?.focus(), 100)
      }
    })
    startCountdown()
  }, [tts, stt, startCountdown])

  const handleConfirm = useCallback(async () => {
    const name = spokenName || textInput.trim()
    if (!name) return
    setPhase(PHASES.DONE)
    setStatusMsg('Swagat hai, ' + name + '!')
    saveUsername(name)
    try { await createUser(name, sessionId) } catch (e) {}
    try { prewarmLessons() } catch (e) {}
    await tts.speak(`Swagat hai ${name}! Chalo Python seekhte hain!`)
    navigate('/learn')
  }, [spokenName, textInput, saveUsername, sessionId, tts, navigate])

  const handleRetry = useCallback(() => {
    clearInterval(countdownRef.current)
    tts.stop(); stt.stopListening()
    setSpokenName(''); setTextInput('')
    setPhase(PHASES.WAIT)
    setStatusMsg('Space dabao ya button dabao')
    setTimeout(() => mainBtnRef.current?.focus(), 100)
  }, [tts, stt])

  const handleTextSubmit = useCallback(() => {
    const name = textInput.trim()
    if (!name) return
    setSpokenName(name)
    setPhase(PHASES.CONFIRM)
    setStatusMsg(`Kya tumhara naam "${name}" hai?`)
    tts.speak(`Kya tumhara naam ${name} hai? Confirm karne ke liye Space dabao.`)
  }, [textInput, tts])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden" style={{ background: 'var(--ink)' }}>
      <a href="#main-content" className="skip-link">Main content pe jao</a>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">{statusMsg}</div>

      <div aria-hidden="true" style={{ position:'absolute', inset:0, pointerEvents:'none',
        background:'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(168,85,247,0.12) 0%, transparent 70%)' }} />

      <main id="main-content" className="relative z-10 flex flex-col items-center text-center px-6 max-w-lg w-full">
        {/* Logo */}
        <div className="mb-10">
          <div style={{ fontSize:'4.5rem', marginBottom:12, filter:'drop-shadow(0 0 24px rgba(168,85,247,0.5))' }} aria-hidden="true">🎧</div>
          <h1 className="gradient-text" style={{ fontFamily:'Syne, sans-serif', fontWeight:800, fontSize:'clamp(2.5rem,8vw,4rem)', lineHeight:1.1 }}>
            CodeVedha
          </h1>
          <p style={{ color:'var(--muted)', marginTop:8, fontSize:'1.05rem' }}>Python Seekho, Aawaz Se</p>
        </div>

        {/* WAIT */}
        {phase === PHASES.WAIT && (
          <div className="flex flex-col items-center gap-6 animate-fade-in w-full">
            <p style={{ color:'var(--text)', fontSize:'1.05rem', lineHeight:1.8, maxWidth:380 }}>
              Yeh platform blind aur visually impaired learners ke liye bana hai. Har cheez aawaz se seekho!
            </p>
            <button ref={mainBtnRef} className="btn-primary"
              style={{ fontSize:'1.2rem', padding:'18px 44px', minWidth:220 }}
              onClick={handleStart}
              aria-label="Shuru Karo — Space ya Enter bhi daba sakte ho">
              🎙 Shuru Karo
            </button>
            <p style={{ color:'var(--muted)', fontSize:'0.85rem' }}>Space ya Enter bhi daba sakte ho</p>
            <div className="w-full mt-2" role="group" aria-label="Ya text mein naam likho">
              <p style={{ color:'var(--muted)', fontSize:'0.82rem', marginBottom:8 }}>Ya seedha naam likho:</p>
              <div className="flex gap-2 w-full">
                <input type="text" value={textInput} onChange={e => setTextInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleTextSubmit()}
                  placeholder="Apna naam yahan..." aria-label="Apna naam text mein likho"
                  style={{ flex:1, background:'var(--card)', border:'1px solid var(--border)', borderRadius:10,
                    color:'var(--text)', padding:'12px 16px', fontSize:'1rem', outline:'none' }}
                  onFocus={e => e.target.style.borderColor='var(--accent)'}
                  onBlur={e => e.target.style.borderColor='var(--border)'} />
                <button className="btn-secondary" onClick={handleTextSubmit} disabled={!textInput.trim()}
                  aria-label="Naam submit karo">✓</button>
              </div>
            </div>
          </div>
        )}

        {/* LISTENING */}
        {phase === PHASES.LISTENING && (
          <div className="flex flex-col items-center gap-6 animate-fade-in">
            <button className="listening-pulse"
              style={{ width:96, height:96, borderRadius:'50%', background:'linear-gradient(135deg,var(--accent),var(--accent2))',
                border:'none', cursor:'pointer', fontSize:'2.5rem', display:'flex', alignItems:'center', justifyContent:'center' }}
              onClick={() => stt.stopListening()}
              aria-label={`Mic khula hai — rok ne ke liye dabao — ${countdown}s baaki`}>
              🎙
            </button>
            <p style={{ color:'var(--accent)', fontSize:'1.2rem', fontWeight:600 }}>
              {stt.isListening ? `Sun raha hun... ${countdown}s` : 'Taiyaar ho raha hun...'}
            </p>
            {stt.transcript && (
              <p style={{ color:'var(--text)', fontSize:'1rem', fontStyle:'italic' }}>"{stt.transcript}"</p>
            )}
            <div className="wave-bars" aria-hidden="true">{[0,1,2,3,4].map(i=><div key={i} className="wave-bar"/>)}</div>
            <p style={{ color:'var(--muted)', fontSize:'0.85rem' }}>Space dabao ya button dabao rokne ke liye</p>
          </div>
        )}

        {/* CONFIRM */}
        {phase === PHASES.CONFIRM && (
          <div className="flex flex-col items-center gap-6 animate-fade-in w-full">
            <p style={{ color:'var(--text)', fontSize:'1.1rem' }}>Kya tumhara naam yeh hai?</p>
            <p className="gradient-text" style={{ fontFamily:'Syne, sans-serif', fontWeight:800, fontSize:'2.2rem' }}>
              {spokenName || textInput}
            </p>
            <div className="flex gap-4 flex-wrap justify-center">
              <button className="btn-primary" autoFocus onClick={handleConfirm} style={{ minWidth:140 }}
                aria-label={`Haan, mera naam ${spokenName || textInput} hai`}>✅ Haan!</button>
              <button className="btn-secondary" onClick={handleRetry} style={{ minWidth:140 }}
                aria-label="Nahi, dobara bolunga">🔄 Dobara</button>
            </div>
            <div className="w-full">
              <p style={{ color:'var(--muted)', fontSize:'0.82rem', marginBottom:8 }}>Ya naam edit karo:</p>
              <div className="flex gap-2 w-full">
                <input type="text" defaultValue={spokenName || textInput}
                  onChange={e => setTextInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleTextSubmit()}
                  aria-label="Naam edit karo"
                  style={{ flex:1, background:'var(--card)', border:'1px solid var(--border)',
                    borderRadius:10, color:'var(--text)', padding:'12px 16px', fontSize:'1rem' }} />
                <button className="btn-secondary" onClick={handleTextSubmit} aria-label="Naam update karo">✓</button>
              </div>
            </div>
          </div>
        )}

        {/* DONE */}
        {phase === PHASES.DONE && (
          <div className="flex flex-col items-center gap-4 animate-fade-in">
            <div style={{ fontSize:'3.5rem' }}>🎉</div>
            <p className="gradient-text" style={{ fontFamily:'Syne, sans-serif', fontWeight:700, fontSize:'1.5rem' }}>{statusMsg}</p>
            <p style={{ color:'var(--muted)' }}>Lesson page load ho raha hai...</p>
          </div>
        )}
      </main>

      <footer className="absolute bottom-6 text-center w-full px-4" style={{ color:'var(--muted)', fontSize:'0.8rem' }}>
        <p>J aur F keys mein physical bump hai — kisi bhi waqt sawaal pooch sakte ho</p>
      </footer>
    </div>
  )
}
