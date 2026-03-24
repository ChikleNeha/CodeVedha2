import { useState, useEffect, useRef, useCallback } from 'react'
import { useApp } from '../context/AppContext'
import { getQuiz, submitQuizResult, updateProgress } from '../utils/api'
import { stopAllAudio, waitUntilDone } from '../hooks/useTTS'
import { MODULES } from '../data/curriculum.js'

const S = { IDLE:'idle', LOADING:'loading', QUESTION:'question', DONE:'done' }

export default function QuizView({ onDifficultyChange }) {
  const { sessionId, currentModule, difficultyLevel, setDifficultyLevel, tts } = useApp()
  const mod = MODULES.find(m => m.id === currentModule) || MODULES[0]

  const [uiState, setUiState]       = useState(S.IDLE)
  const [questions, setQuestions]   = useState([])
  const [idx, setIdx]               = useState(0)
  const [score, setScore]           = useState(0)
  const [selected, setSelected]     = useState(null)
  const [feedback, setFeedback]     = useState(null)
  const [finalMsg, setFinalMsg]     = useState('')
  const [wrongTopics, setWrongTopics] = useState([])
  const [diffBadge, setDiffBadge]   = useState(difficultyLevel)
  const [badgeAnim, setBadgeAnim]   = useState(false)

  // Refs to avoid stale closures
  const stateRef     = useRef(S.IDLE)
  const questionsRef = useRef([])
  const idxRef       = useRef(0)
  const scoreRef     = useRef(0)
  const wrongRef     = useRef([])
  const diffRef      = useRef(difficultyLevel)

  useEffect(() => { diffRef.current = difficultyLevel; setDiffBadge(difficultyLevel) }, [difficultyLevel])

  // Reset on module change
  useEffect(() => {
    stopAllAudio()
    stateRef.current = S.IDLE; setUiState(S.IDLE)
    questionsRef.current = []; setQuestions([])
    idxRef.current = 0; setIdx(0)
    scoreRef.current = 0; setScore(0)
    wrongRef.current = []; setWrongTopics([])
    setSelected(null); setFeedback(null); setFinalMsg('')
  }, [currentModule])

  // Keyboard
  useEffect(() => {
    const handler = async (e) => {
      const typing = ['input','textarea'].includes(document.activeElement?.tagName?.toLowerCase())
      if (typing) return
      if ((e.key === ' ' || e.key === 'Enter') && stateRef.current === S.IDLE) { e.preventDefault(); startQuiz() }
      if (stateRef.current === S.QUESTION) {
        const n = parseInt(e.key)
        if (n >= 1 && n <= 4) { e.preventDefault(); handleAnswer(n - 1) }
      }
      if (e.key === 'Escape') stopAllAudio()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, []) // eslint-disable-line

  // ... your existing keyboard useEffect ...

// ✅ NEW: Auto-intro audio when quiz page loads
useEffect(() => {
  if (uiState === S.IDLE && currentModule) {
    const introTimer = setTimeout(async () => {
      stopAllAudio(); // Clear any previous audio
      await tts.speak(`${mod.title} module ka quiz page khula hai. Taiyaar ho jao! Enter ya Space dabao quiz shuru karne ke liye. 1 se 4 keys jawab dene ke liye.`);
    }, 1000); // 1s delay for smooth UX
    
    return () => clearTimeout(introTimer);
  }
}, [currentModule, mod.title, tts, uiState]);


  const speakQuestion = useCallback(async (qs, i) => {
    const q = qs[i]
    if (!q) return
    const opts = q.options.map((o, n) => `Option ${n+1}: ${o}`).join('. ')
    await tts.speak(`Sawaal ${i+1} of ${qs.length}. ${q.question}. ${opts}. 1 se ${q.options.length} key dabao.`)
  }, [tts])

  const startQuiz = useCallback(async () => {
    if (stateRef.current === S.LOADING) return
    stateRef.current = S.LOADING; setUiState(S.LOADING)
    await tts.speak(`${mod.title} ka quiz shuru ho raha hai. Taiyaar ho jao!`)
    try {
      const data = await getQuiz(sessionId, currentModule, diffRef.current)
      const qs = data.questions || []
      if (!qs.length) { await tts.speak('Quiz questions nahi mile. Dobara try karo.'); stateRef.current = S.IDLE; setUiState(S.IDLE); return }
      questionsRef.current = qs; idxRef.current = 0; scoreRef.current = 0; wrongRef.current = []
      setQuestions(qs); setIdx(0); setScore(0); setSelected(null); setFeedback(null); setWrongTopics([])
      stateRef.current = S.QUESTION; setUiState(S.QUESTION)
      await speakQuestion(qs, 0)
    } catch (err) {
      await tts.speak('Quiz load karne mein problem aayi.')
      stateRef.current = S.IDLE; setUiState(S.IDLE)
    }
  }, [sessionId, currentModule, tts, mod, speakQuestion])

  const handleAnswer = useCallback(async (optIdx) => {
    if (stateRef.current !== S.QUESTION) return
    const qs = questionsRef.current
    const i  = idxRef.current
    const q  = qs[i]
    if (!q || selected !== null) return   // guard double-tap

    stopAllAudio()
    await new Promise(r => setTimeout(r, 80))

    setSelected(optIdx)
    const correct = optIdx === q.correct

    if (correct) {
      scoreRef.current++
      setScore(scoreRef.current)
      const msg = `Sahi jawab! ${q.explanation}`
      setFeedback({ correct: true, text: `✅ ${msg}` })
      await tts.speak(msg)
    } else {
      if (!wrongRef.current.includes(q.topic)) { wrongRef.current = [...wrongRef.current, q.topic]; setWrongTopics([...wrongRef.current]) }
      const msg = `Galat. Sahi jawab tha: ${q.options[q.correct]}. ${q.explanation}`
      setFeedback({ correct: false, text: `❌ ${msg}` })
      await tts.speak(msg)
    }

    await new Promise(r => setTimeout(r, 800))
    await waitUntilDone(30000)

    const nextI = i + 1
    if (nextI < qs.length) {
      idxRef.current = nextI; setIdx(nextI); setSelected(null); setFeedback(null)
      await speakQuestion(qs, nextI)
    } else {
      await finishQuiz()
    }
  }, [selected, tts, speakQuestion])  // eslint-disable-line

  const finishQuiz = useCallback(async () => {
    stateRef.current = S.DONE; setUiState(S.DONE)
    const total = questionsRef.current.length
    const sc    = scoreRef.current
    const pct   = total ? Math.round((sc / total) * 100) : 0

    let msg = pct >= 80 ? `Zabardast! ${sc} mein se ${sc} — ${pct} percent!`
            : pct >= 60 ? `Accha kiya! ${sc} of ${total} — ${pct} percent.`
            : `${sc} of ${total} — ${pct} percent. Dobara practice karo!`
    setFinalMsg(msg)

    try {
      const res = await submitQuizResult({
        session_id: sessionId, module_id: currentModule,
        score: sc, total,
        wrong_topics: wrongRef.current,
        current_difficulty: diffRef.current
      })
      if (res.changed && res.new_difficulty) {
        setDifficultyLevel(res.new_difficulty)
        setDiffBadge(res.new_difficulty)
        setBadgeAnim(true); setTimeout(() => setBadgeAnim(false), 2500)
        onDifficultyChange?.(res.new_difficulty)
        const diffMsg = res.new_difficulty === 'intermediate'
          ? 'Difficulty badh gayi — intermediate!'
          : res.new_difficulty === 'advanced' ? 'Difficulty badh gayi — advanced!'
          : 'Dobara beginner level pe practice karte hain.'
        msg += ` ${diffMsg}`
        setFinalMsg(msg)
      }
      await updateProgress({ session_id: sessionId, module_id: currentModule, status: pct >= 60 ? 'completed' : 'in_progress', quiz_score: sc })
    } catch (e) {}

    await tts.speak(msg)
  }, [sessionId, currentModule, tts, setDifficultyLevel, onDifficultyChange])

  const resetQuiz = useCallback(() => {
    stopAllAudio()
    stateRef.current = S.IDLE; setUiState(S.IDLE)
    setSelected(null); setFeedback(null); setFinalMsg('')
  }, [])

  const q = questions[idx]
  const DIFF_COLORS = { beginner:'#4ade80', intermediate:'#a855f7', advanced:'#ec4899' }

  return (
    <div style={{ padding:'24px', maxWidth:700, margin:'0 auto' }} role="region" aria-label="Quiz" aria-live="polite">

      {/* Difficulty badge top-right */}
      <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:12 }}>
        <span aria-label={`Difficulty: ${diffBadge}`}
          style={{ background: badgeAnim ? `${DIFF_COLORS[diffBadge]}22` : 'rgba(168,85,247,0.1)',
            border:`1px solid ${badgeAnim ? DIFF_COLORS[diffBadge] : 'rgba(168,85,247,0.3)'}`,
            color: badgeAnim ? DIFF_COLORS[diffBadge] : 'var(--accent)',
            borderRadius:20, padding:'4px 14px', fontSize:'0.78rem', fontWeight:600,
            transition:'all 0.5s', transform: badgeAnim ? 'scale(1.15)' : 'scale(1)' }}>
          {diffBadge}
        </span>
      </div>

      {/* IDLE */}
      {uiState === S.IDLE && (
        <div style={{ textAlign:'center', paddingTop:36 }}>
          <div style={{ fontSize:'3rem', marginBottom:14 }} aria-hidden="true">🧠</div>
          <h2 style={{ fontFamily:'Syne, sans-serif', fontWeight:700, fontSize:'1.5rem', color:'var(--text)', marginBottom:8 }}>
            {mod.title} — Quiz
          </h2>
          <p style={{ color:'var(--muted)', marginBottom:32, lineHeight:1.8 }}>
            5 sawaal honge. Audio mein sunoge. 1–4 keys se jawab do.
          </p>
          <button className="btn-primary" autoFocus onClick={startQuiz}
            aria-label="Quiz shuru karo — Space ya Enter"
            style={{ fontSize:'1.1rem', padding:'16px 40px' }}>
            🚀 Quiz Shuru Karo
          </button>
          <p style={{ color:'var(--muted)', fontSize:'0.82rem', marginTop:10 }}>Space ya Enter bhi kaam karega</p>
        </div>
      )}

      {/* LOADING */}
      {uiState === S.LOADING && (
        <div style={{ textAlign:'center', paddingTop:60 }}>
          <div className="wave-bars" style={{ justifyContent:'center', marginBottom:16 }} aria-hidden="true">
            {[0,1,2,3,4].map(i=><div key={i} className="wave-bar"/>)}
          </div>
          <p style={{ color:'var(--muted)' }}>Quiz taiyaar ho raha hai...</p>
        </div>
      )}

      {/* QUESTION */}
      {uiState === S.QUESTION && q && (
        <div className="animate-fade-in">
          {/* Progress bar */}
          <div style={{ marginBottom:20 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
              <span style={{ color:'var(--muted)', fontSize:'0.82rem' }}>Sawaal {idx+1} / {questions.length}</span>
              <span style={{ color:'var(--accent)', fontSize:'0.82rem', fontWeight:600 }}>Score: {score}</span>
            </div>
            <div style={{ height:4, background:'var(--border)', borderRadius:2 }}>
              <div style={{ height:'100%', borderRadius:2, transition:'width 0.4s',
                width:`${((idx+1)/questions.length)*100}%`,
                background:'linear-gradient(90deg,var(--accent),var(--accent2))' }} />
            </div>
          </div>

          {/* Question card */}
          <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16,
            padding:'22px', marginBottom:20 }}>
            <p style={{ color:'var(--text)', fontSize:'1.08rem', lineHeight:1.85, margin:0, fontWeight:500 }}>
              {q.question}
            </p>
          </div>

          {/* Feedback */}
          {feedback && (
            <div role="alert" style={{ padding:'14px 18px', borderRadius:12, marginBottom:16,
              background: feedback.correct
                ? 'linear-gradient(135deg,rgba(74,222,128,0.12),rgba(34,197,94,0.08))'
                : 'linear-gradient(135deg,rgba(255,95,95,0.12),rgba(239,68,68,0.08))',
              border:`1px solid ${feedback.correct ? 'rgba(74,222,128,0.3)' : 'rgba(255,95,95,0.3)'}`,
              color: feedback.correct ? '#4ade80' : '#ff5f5f',
              fontSize:'0.92rem', lineHeight:1.7 }}>
              {feedback.text}
            </div>
          )}

          {/* Options */}
          <div role="group" aria-label="Jawab ke options — 1–4 key dabao"
            style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {q.options.map((opt, i) => {
              const done      = selected !== null
              const isCorrect = i === q.correct
              const isSel     = selected === i
              const bgColor   = done ? (isCorrect ? 'rgba(74,222,128,0.1)' : isSel ? 'rgba(255,95,95,0.1)' : 'var(--card)') : 'var(--card)'
              const bdColor   = done ? (isCorrect ? '#4ade80' : isSel ? '#ff5f5f' : 'var(--border)') : 'var(--border)'
              const txColor   = done ? (isCorrect ? '#4ade80' : isSel ? '#ff5f5f' : 'var(--muted)') : 'var(--text)'
              return (
                <button key={i} onClick={() => handleAnswer(i)} disabled={done}
                  aria-label={`Option ${i+1}: ${opt}${done && isCorrect ? ' — sahi' : ''}${done && isSel && !isCorrect ? ' — galat' : ''}`}
                  style={{ background:bgColor, border:`2px solid ${bdColor}`, borderRadius:12,
                    padding:'13px 18px', textAlign:'left', cursor: done ? 'default' : 'pointer',
                    display:'flex', alignItems:'center', gap:12, minHeight:52,
                    color:txColor, transition:'all 0.2s' }}>
                  <span style={{ width:30, height:30, borderRadius:'50%', flexShrink:0,
                    background: done ? (isCorrect ? 'rgba(74,222,128,0.2)' : isSel ? 'rgba(255,95,95,0.2)' : 'var(--border)') : 'var(--border)',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:'0.82rem', fontWeight:700, color:txColor }}>
                    {done && isCorrect ? '✓' : done && isSel ? '✗' : i+1}
                  </span>
                  <span style={{ fontSize:'0.93rem', lineHeight:1.5 }}>{opt}</span>
                </button>
              )
            })}
          </div>
          <p style={{ color:'var(--muted)', fontSize:'0.76rem', marginTop:14, textAlign:'center' }}>
            Keyboard: 1, 2, 3, ya 4 press karo
          </p>
        </div>
      )}

      {/* DONE */}
      {uiState === S.DONE && (
        <div style={{ textAlign:'center', paddingTop:28 }} className="animate-fade-in">
          <div style={{ fontSize:'3.5rem', marginBottom:14 }} aria-hidden="true">
            {scoreRef.current / (questionsRef.current.length||1) >= 0.8 ? '🏆' :
             scoreRef.current / (questionsRef.current.length||1) >= 0.6 ? '🎉' : '💪'}
          </div>
          <h2 style={{ fontFamily:'Syne, sans-serif', fontWeight:700, fontSize:'1.5rem', color:'var(--text)', marginBottom:6 }}>Quiz Complete!</h2>
          <p style={{ fontSize:'3rem', fontWeight:800, fontFamily:'Syne, sans-serif',
            background:'linear-gradient(135deg,var(--accent),var(--accent2))',
            WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text', marginBottom:6 }}>
            {scoreRef.current}/{questionsRef.current.length}
          </p>

          {/* Animated difficulty badge on completion */}
          <div style={{ display:'flex', justifyContent:'center', marginBottom:16 }}>
            <span style={{ background: badgeAnim ? `${DIFF_COLORS[diffBadge]}22` : 'rgba(168,85,247,0.1)',
              border:`1px solid ${badgeAnim ? DIFF_COLORS[diffBadge] : 'rgba(168,85,247,0.3)'}`,
              color: badgeAnim ? DIFF_COLORS[diffBadge] : 'var(--accent)',
              borderRadius:20, padding:'6px 18px', fontSize:'0.9rem', fontWeight:700,
              transition:'all 0.5s', transform: badgeAnim ? 'scale(1.2)' : 'scale(1)' }}>
              Level: {diffBadge}
            </span>
          </div>

          <p style={{ color:'var(--text)', lineHeight:1.8, maxWidth:420, margin:'0 auto 28px', fontSize:'0.95rem' }}>
            {finalMsg}
          </p>
          {wrongTopics.length > 0 && (
            <div style={{ background:'rgba(255,179,71,0.08)', border:'1px solid rgba(255,179,71,0.25)',
              borderRadius:12, padding:'14px 18px', marginBottom:22, textAlign:'left', maxWidth:420, margin:'0 auto 22px' }}>
              <p style={{ color:'var(--warning)', fontWeight:600, marginBottom:6, fontSize:'0.88rem' }}>
                Yeh topics aur practice karo:
              </p>
              <p style={{ color:'var(--text)', fontSize:'0.88rem', margin:0 }}>{wrongTopics.join(', ')}</p>
            </div>
          )}
          <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap' }}>
            <button className="btn-primary" autoFocus onClick={startQuiz} aria-label="Quiz dobara do">🔄 Dobara</button>
            <button className="btn-secondary" onClick={resetQuiz} aria-label="Wapas jao">Wapas Jao</button>
          </div>
        </div>
      )}
    </div>
  )
}
