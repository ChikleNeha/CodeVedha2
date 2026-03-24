import { useState, useEffect, useRef, useCallback } from 'react'
import { useApp } from '../context/AppContext'
import { runCode } from '../utils/api'
import { stopAllAudio } from '../hooks/useTTS'

export default function CodeView() {
  const { currentModule, tts, stt } = useApp()

  const [history, setHistory]         = useState([])     // [{spoken, code, output, error, errorExpl, success}]
  const [isRecording, setIsRecording] = useState(false)
  const [isRunning, setIsRunning]     = useState(false)
  const [textInput, setTextInput]     = useState('')
  const [liveTranscript, setLiveTranscript] = useState('')
  const lastOutputRef = useRef('')
  const historyEndRef = useRef(null)

  // Keyboard shortcuts
  useEffect(() => {
    const handler = async (e) => {
      const typing = ['input','textarea'].includes(document.activeElement?.tagName?.toLowerCase())
      if (e.key === ' ' && !typing) {
        e.preventDefault()
        if (isRecording) { stopRecording() } else if (!isRunning) { startRecording() }
      }
      if ((e.key === 'r' || e.key === 'R') && !typing) {
        e.preventDefault()
        if (lastOutputRef.current) await tts.speak(lastOutputRef.current)
      }
      if ((e.key === 'c' || e.key === 'C') && !typing) {
        e.preventDefault()
        setHistory([]); lastOutputRef.current = ''
        await tts.speak('History clear ho gayi.')
      }
      if (e.key === 'Escape') { stopAllAudio(); stt.stopListening() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isRecording, isRunning, tts, stt]) // eslint-disable-line

  // Scroll to bottom when history updates
  useEffect(() => {
    setTimeout(() => {
      if (historyEndRef.current) historyEndRef.current.scrollTop = historyEndRef.current.scrollHeight
    }, 80)
  }, [history])

  const startRecording = useCallback(async () => {
    if (isRecording || isRunning) return
    setLiveTranscript('')
    stopAllAudio()
    await tts.speak('Boliye — kya code banana hai?')
    await new Promise(r => setTimeout(r, 300))
    setIsRecording(true)
    stt.startListening((final) => {
      setIsRecording(false)
      if (final?.trim()) {
        setLiveTranscript(final)
        executeSpokenCode(final.trim())
      } else {
        tts.speak('Kuch sunai nahi diya. Dobara Space dabao.')
      }
    })
  }, [isRecording, isRunning, tts, stt]) // eslint-disable-line

  const stopRecording = useCallback(() => {
    stt.stopListening()
    setIsRecording(false)
  }, [stt])

  const executeSpokenCode = useCallback(async (spoken) => {
    setIsRunning(true)
    await tts.speak('Code run ho raha hai...')
    try {
      const result = await runCode(spoken, currentModule)
      const entry = { spoken, code: result.code, output: result.output,
        error: result.error, errorExpl: result.error_explanation, success: result.success }
      setHistory(prev => [...prev, entry])

      let toSpeak = ''
      if (result.success && result.output) {
        toSpeak = `Code chal gaya! Output hai: ${result.output}`
      } else if (result.error) {
        toSpeak = result.error_explanation || `Error aayi: ${result.error}`
      } else if (result.output) {
        toSpeak = `Output: ${result.output}`
      } else {
        toSpeak = 'Code chala, koi output nahi.'
      }
      lastOutputRef.current = toSpeak
      await tts.speak(toSpeak)
    } catch (err) {
      const entry = { spoken, code: '', output: '', error: 'Server se connect nahi ho paya.', errorExpl: 'Backend check karo.', success: false }
      setHistory(prev => [...prev, entry])
      await tts.speak('Server se connect nahi ho paya. Backend chalu hai?')
    }
    setIsRunning(false)
    setLiveTranscript('')
  }, [currentModule, tts])

  const handleTextSubmit = useCallback(async () => {
    const txt = textInput.trim()
    if (!txt || isRunning) return
    setTextInput('')
    setLiveTranscript(txt)
    await executeSpokenCode(txt)
  }, [textInput, isRunning, executeSpokenCode])

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>

      {/* Header */}
      <div style={{ padding:'14px 24px', borderBottom:'1px solid var(--border)',
        background:'var(--surface)', flexShrink:0, display:'flex', alignItems:'center', gap:12 }}>
        <span style={{ fontSize:'1.3rem' }} aria-hidden="true">💻</span>
        <div style={{ flex:1 }}>
          <h2 style={{ fontFamily:'Syne, sans-serif', fontWeight:700, fontSize:'1.05rem', color:'var(--text)', margin:0 }}>
            Code Practice
          </h2>
          <p style={{ color:'var(--muted)', fontSize:'0.78rem', margin:0 }}>
            Space: mic · R: repeat · C: clear
          </p>
        </div>
        {isRunning && (
          <div className="wave-bars" aria-hidden="true">
            {[0,1,2,3,4].map(i=><div key={i} className="wave-bar" style={{ width:3 }}/>)}
          </div>
        )}
      </div>

      {/* History scroll area */}
      <div ref={historyEndRef} style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}
        role="log" aria-label="Code history" aria-live="polite">

        {history.length === 0 && !isRecording && !isRunning && (
          <div style={{ textAlign:'center', paddingTop:48 }}>
            <div style={{ fontSize:'3rem', marginBottom:14 }} aria-hidden="true">🎙</div>
            <h3 style={{ fontFamily:'Syne, sans-serif', color:'var(--text)', fontWeight:700,
              fontSize:'1.3rem', marginBottom:10 }}>Voice se Python likho!</h3>
            <p style={{ color:'var(--muted)', lineHeight:1.9, maxWidth:420, margin:'0 auto', fontSize:'0.95rem' }}>
              Space dabao aur bolo kya banana hai.<br/>
              Jaise: "for loop 1 se 5 tak print karo"<br/>
              ya "variable naam equals Rahul print karo"
            </p>
            <div style={{ marginTop:24, display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap' }}>
              {['print hello world', 'for loop 1 se 5 tak', 'variable x equals 10 print karo'].map(ex => (
                <button key={ex} onClick={() => { setTextInput(ex) }}
                  style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:8,
                    color:'var(--muted)', padding:'8px 14px', cursor:'pointer', fontSize:'0.8rem',
                    fontFamily:'JetBrains Mono, monospace' }}>
                  "{ex}"
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Live recording indicator */}
        {isRecording && (
          <div style={{ textAlign:'center', paddingTop:32 }}>
            <button className="listening-pulse"
              style={{ width:80, height:80, borderRadius:'50%',
                background:'linear-gradient(135deg,var(--accent),var(--accent2))',
                border:'none', cursor:'pointer', fontSize:'2rem',
                display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}
              onClick={stopRecording}
              aria-label="Recording — rokne ke liye dabao">🎙</button>
            <p style={{ color:'var(--accent)', fontWeight:600, fontSize:'1.1rem' }}>
              Sun raha hun... Space dabao rokne ke liye
            </p>
            {stt.transcript && (
              <p style={{ color:'var(--text)', marginTop:8, fontStyle:'italic', fontSize:'0.95rem' }}>
                "{stt.transcript}"
              </p>
            )}
          </div>
        )}

        {/* Running indicator */}
        {isRunning && !isRecording && (
          <div style={{ marginBottom:20, padding:'16px 20px', background:'rgba(168,85,247,0.07)',
            border:'1px solid rgba(168,85,247,0.2)', borderRadius:12 }}>
            <p style={{ color:'var(--muted)', fontSize:'0.88rem', fontStyle:'italic', margin:0 }}>
              ⚙️ "{liveTranscript}" — code generate aur run ho raha hai...
            </p>
          </div>
        )}

        {/* History entries */}
        {history.map((entry, i) => (
          <div key={i} style={{ marginBottom:24, animation:'slideUp 0.3s ease' }}>
            {/* Spoken input */}
            <div style={{ display:'flex', alignItems:'flex-start', gap:8, marginBottom:10 }}>
              <span style={{ fontSize:'0.9rem' }} aria-hidden="true">🎙</span>
              <p style={{ color:'var(--muted)', fontSize:'0.85rem', margin:0, fontStyle:'italic' }}>
                "{entry.spoken}"
              </p>
            </div>

            {/* Generated code */}
            {entry.code && (
              <div style={{ marginBottom:10 }}>
                <p style={{ color:'var(--muted)', fontSize:'0.76rem', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.08em' }}>
                  Generated Python:
                </p>
                <pre style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:12,
                  padding:'16px 18px', fontFamily:'JetBrains Mono, monospace', fontSize:'0.88rem',
                  color:'var(--text)', overflowX:'auto', margin:0, whiteSpace:'pre-wrap', wordBreak:'break-all',
                  lineHeight:1.7 }}
                  aria-label={`Generated code: ${entry.code}`}>
                  {entry.code}
                </pre>
              </div>
            )}

            {/* Output */}
            {entry.success && entry.output && (
              <div style={{ background:'rgba(74,222,128,0.08)', border:'1px solid rgba(74,222,128,0.25)',
                borderRadius:12, padding:'14px 18px' }}
                role="region" aria-label={`Output: ${entry.output}`}>
                <p style={{ color:'#4ade80', fontSize:'0.76rem', fontWeight:600,
                  textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>✅ Output</p>
                <pre style={{ color:'#4ade80', fontFamily:'JetBrains Mono, monospace',
                  fontSize:'0.9rem', margin:0, whiteSpace:'pre-wrap' }}>
                  {entry.output}
                </pre>
              </div>
            )}

            {/* No output success */}
            {entry.success && !entry.output && (
              <div style={{ background:'rgba(74,222,128,0.06)', border:'1px solid rgba(74,222,128,0.2)',
                borderRadius:12, padding:'12px 16px' }}>
                <p style={{ color:'#4ade80', fontSize:'0.88rem', margin:0 }}>✅ Code chal gaya! Koi output nahi.</p>
              </div>
            )}

            {/* Error */}
            {entry.error && (
              <div style={{ background:'rgba(255,95,95,0.08)', border:'1px solid rgba(255,95,95,0.25)',
                borderRadius:12, padding:'14px 18px' }}
                role="alert" aria-label={`Error: ${entry.errorExpl || entry.error}`}>
                <p style={{ color:'#ff5f5f', fontSize:'0.76rem', fontWeight:600,
                  textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>❌ Error</p>
                {entry.errorExpl && (
                  <p style={{ color:'var(--text)', fontSize:'0.9rem', marginBottom:8, lineHeight:1.7 }}>
                    {entry.errorExpl}
                  </p>
                )}
                <pre style={{ color:'#ff9999', fontFamily:'JetBrains Mono, monospace',
                  fontSize:'0.78rem', margin:0, whiteSpace:'pre-wrap', opacity:0.7 }}>
                  {entry.error}
                </pre>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Bottom controls */}
      <div style={{ flexShrink:0, padding:'16px 24px', borderTop:'1px solid var(--border)',
        background:'var(--surface)' }}>

        {/* Big mic button */}
        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:12 }}>
          <button
            className={isRecording ? 'listening-pulse' : ''}
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isRunning}
            aria-label={isRecording ? 'Recording rok do — Space' : 'Code bolna shuru karo — Space'}
            style={{ width:64, height:64, borderRadius:'50%', flexShrink:0,
              background: isRecording
                ? 'linear-gradient(135deg,var(--accent),var(--accent2))'
                : isRunning ? 'var(--border)' : 'var(--card)',
              border: isRecording ? 'none' : '2px solid var(--border)',
              cursor: isRunning ? 'not-allowed' : 'pointer',
              fontSize:'1.6rem', display:'flex', alignItems:'center', justifyContent:'center' }}>
            {isRunning ? '⚙️' : '🎙'}
          </button>
          <div style={{ flex:1 }}>
            <p style={{ color: isRecording ? 'var(--accent)' : 'var(--text)',
              fontWeight:600, margin:0, fontSize:'0.95rem' }}>
              {isRecording ? 'Sun raha hun...' : isRunning ? 'Code run ho raha hai...' : 'Space dabao aur code bolo'}
            </p>
            <p style={{ color:'var(--muted)', fontSize:'0.78rem', margin:'2px 0 0' }}>
              R: repeat output · C: history clear
            </p>
          </div>
        </div>

        {/* Text fallback — always visible */}
        <div style={{ display:'flex', gap:8 }}>
          <input type="text" value={textInput} onChange={e => setTextInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleTextSubmit()}
            placeholder="Ya text mein likho — jaise: print hello world..."
            aria-label="Text mein code instruction likho"
            disabled={isRunning}
            style={{ flex:1, background:'var(--card)', border:'1px solid var(--border)', borderRadius:10,
              color:'var(--text)', padding:'11px 16px', fontSize:'0.92rem', outline:'none',
              opacity: isRunning ? 0.5 : 1 }}
            onFocus={e => e.target.style.borderColor='var(--accent)'}
            onBlur={e => e.target.style.borderColor='var(--border)'} />
          <button className="btn-primary" onClick={handleTextSubmit}
            disabled={!textInput.trim() || isRunning}
            aria-label="Code run karo"
            style={{ padding:'11px 20px', fontSize:'0.9rem' }}>
            ▶ Run
          </button>
        </div>
      </div>
    </div>
  )
}
