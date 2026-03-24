import { useState, useEffect, useCallback, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { stopAllAudio } from '../hooks/useTTS'
import { getProgress, updateProgress } from '../utils/api'
import ModuleSidebar from '../components/ModuleSidebar'
import LessonView from '../components/LessonView'
import QuizView from '../components/QuizView'
import CodeView from '../components/CodeView'
import { MODULES, SHORTCUTS, DIFFICULTY_LABELS } from '../data/curriculum.js'

const TABS = { LESSON:'lesson', QUIZ:'quiz', CODE:'code' }

export default function LearnPage() {
  const {
    username, sessionId, currentModule, setCurrentModule,
    difficultyLevel, setDifficultyLevel,
    isHighContrast, toggleHighContrast,
    changeFontSize, replayLast, tts
  } = useApp()

  const [activeTab, setActiveTab]   = useState(TABS.LESSON)
  const [progress, setProgress]     = useState([])
  const [showHelp, setShowHelp]     = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [diffBadge, setDiffBadge]   = useState(difficultyLevel)
  const [badgeAnim, setBadgeAnim]   = useState(false)

  const activeTabRef     = useRef(TABS.LESSON)
  const currentModuleRef = useRef(currentModule)

  useEffect(() => { activeTabRef.current = activeTab }, [activeTab])
  useEffect(() => { currentModuleRef.current = currentModule }, [currentModule])
  useEffect(() => { setDiffBadge(difficultyLevel) }, [difficultyLevel])

  // Load progress
  const refreshProgress = useCallback(() => {
    if (!sessionId) return
    getProgress(sessionId)
      .then(d => setProgress(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [sessionId])

  useEffect(() => { refreshProgress() }, [sessionId, currentModule, refreshProgress])

  // Handle difficulty change from child components
  const handleDifficultyChange = useCallback((newDiff) => {
    setDifficultyLevel(newDiff)
    setDiffBadge(newDiff)
    setBadgeAnim(true)
    setTimeout(() => setBadgeAnim(false), 2500)
    const msg = newDiff === 'intermediate' ? 'Difficulty badh gayi — intermediate!'
              : newDiff === 'advanced'     ? 'Difficulty badh gayi — advanced!'
              : 'Wapas beginner level pe practice karte hain.'
    tts.speak(msg)
    refreshProgress()
  }, [setDifficultyLevel, tts, refreshProgress])

  // Progress summary
  const speakProgressSummary = useCallback(async () => {
    const completed = progress.filter(p => p.status === 'completed').length
    const scores    = progress.filter(p => p.quiz_score > 0).map(p => p.quiz_score)
    const avg       = scores.length ? Math.round(scores.reduce((a,b)=>a+b,0) / scores.length) : 0
    const msg = `Aapne ${completed} mein se 5 modules complete kiye hain. Aapka average quiz score ${avg} out of 5 hai.`
    await tts.speak(msg)
  }, [progress, tts])

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = async (e) => {
      const typing = ['input','textarea'].includes(document.activeElement?.tagName?.toLowerCase())
      const mod    = currentModuleRef.current

      if (e.key === 'Escape') { stopAllAudio(); setShowHelp(false) }
      if (typing) return

      if (e.key === 'l' || e.key === 'L') { e.preventDefault(); setActiveTab(TABS.LESSON); tts.speak('Lesson tab') }
      if (e.key === 'q' || e.key === 'Q') { e.preventDefault(); setActiveTab(TABS.QUIZ);   tts.speak('Quiz tab') }
      if (e.key === 'x' || e.key === 'X') { e.preventDefault(); setActiveTab(TABS.CODE);   tts.speak('Code tab') }
      if (e.key === 'r' || e.key === 'R') { e.preventDefault(); replayLast() }
      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault()
        setShowHelp(p => { if (!p) tts.speak('Shortcut help khula. Escape se band karo.'); return !p })
      }
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        const next = Math.min(5, mod + 1)
        if (next !== mod) { setCurrentModule(next); const m = MODULES.find(x=>x.id===next); if(m) tts.speak(`${m.icon} ${m.title}`) }
      }
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault()
        // If idle (not in quiz/lesson mid-flow) and pressing P — speak progress
        if (activeTabRef.current !== TABS.QUIZ) {
          const prev = Math.max(1, mod - 1)
          if (prev !== mod) { setCurrentModule(prev); const m = MODULES.find(x=>x.id===prev); if(m) tts.speak(`${m.icon} ${m.title}`) }
          else { await speakProgressSummary() }  // already at module 1 — speak progress
        }
      }
      if (e.altKey && e.key === 'c') { e.preventDefault(); toggleHighContrast(); tts.speak(isHighContrast ? 'High contrast off' : 'High contrast on') }
      if (e.altKey && ['1','2','3','4'].includes(e.key)) { e.preventDefault(); changeFontSize(parseInt(e.key)-1); tts.speak(`Font size ${e.key}`) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isHighContrast, toggleHighContrast, changeFontSize, replayLast, tts, setCurrentModule, speakProgressSummary]) // eslint-disable-line

  const DIFF_COLORS = { beginner:'#4ade80', intermediate:'#a855f7', advanced:'#ec4899' }
  const currentMod  = MODULES.find(m => m.id === currentModule) || MODULES[0]

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh',
      background:'var(--ink)', color:'var(--text)', overflow:'hidden' }}>

      <a href="#learn-main" className="skip-link">Main content pe jao</a>
      <div role="status"  aria-live="polite"    aria-atomic="true" className="sr-only" />
      <div role="alert"   aria-live="assertive" aria-atomic="true" className="sr-only" />

      {/* ── Top nav ── */}
      <header style={{ display:'flex', alignItems:'center', gap:10, padding:'0 18px',
        height:54, background:'var(--surface)', borderBottom:'1px solid var(--border)',
        flexShrink:0, zIndex:20 }}>

        <div style={{ fontFamily:'Syne, sans-serif', fontWeight:800, fontSize:'1.1rem' }} aria-label="CodeVedha">
          <span className="gradient-text">CodeVedha</span>
        </div>

        <button onClick={() => setSidebarOpen(p=>!p)}
          aria-label={sidebarOpen ? 'Sidebar band karo' : 'Sidebar kholo'}
          style={{ background:'transparent', border:'1px solid var(--border)', borderRadius:7,
            color:'var(--muted)', padding:'5px 10px', cursor:'pointer', fontSize:'0.95rem', minHeight:36 }}>
          ☰
        </button>

        {/* Tab buttons */}
        <nav aria-label="Content tabs" style={{ display:'flex', gap:4 }}>
          {[{id:TABS.LESSON,label:'📖 Lesson',key:'L'},{id:TABS.QUIZ,label:'🧠 Quiz',key:'Q'},{id:TABS.CODE,label:'💻 Code',key:'X'}]
            .map(tab => (
              <button key={tab.id} role="tab" aria-selected={activeTab===tab.id}
                onClick={() => setActiveTab(tab.id)}
                aria-label={`${tab.label} — shortcut ${tab.key}`}
                style={{ background: activeTab===tab.id ? 'rgba(168,85,247,0.15)' : 'transparent',
                  border: activeTab===tab.id ? '1px solid var(--accent)' : '1px solid transparent',
                  borderRadius:8, color: activeTab===tab.id ? 'var(--accent)' : 'var(--muted)',
                  padding:'5px 13px', cursor:'pointer', fontFamily:'DM Sans, sans-serif',
                  fontWeight: activeTab===tab.id ? 600 : 400, fontSize:'0.83rem',
                  minHeight:34, transition:'all 0.15s' }}>
                {tab.label}
              </button>
            ))}
        </nav>

        <div style={{ flex:1 }} />

        {/* User */}
        {username && <span style={{ color:'var(--muted)', fontSize:'0.8rem' }}>👤 {username}</span>}

        {/* Animated difficulty badge */}
        <span aria-label={`Difficulty: ${diffBadge}`}
          style={{ background: badgeAnim ? `${DIFF_COLORS[diffBadge]}22` : 'rgba(168,85,247,0.1)',
            border:`1px solid ${badgeAnim ? DIFF_COLORS[diffBadge] : 'rgba(168,85,247,0.3)'}`,
            color: badgeAnim ? DIFF_COLORS[diffBadge] : 'var(--accent)',
            borderRadius:20, padding:'3px 11px', fontSize:'0.76rem', fontWeight:600,
            transition:'all 0.5s', transform: badgeAnim ? 'scale(1.15)' : 'scale(1)' }}>
          {DIFFICULTY_LABELS[diffBadge] || diffBadge}
        </span>

        <button onClick={() => setShowHelp(p=>!p)} aria-label="Keyboard shortcuts — H key" aria-expanded={showHelp}
          style={{ background:'transparent', border:'1px solid var(--border)', borderRadius:7,
            color:'var(--muted)', padding:'5px 11px', cursor:'pointer', fontSize:'0.8rem', minHeight:34 }}>
          ? Help
        </button>

        <button onClick={toggleHighContrast} aria-pressed={isHighContrast}
          aria-label={isHighContrast ? 'High contrast band karo' : 'High contrast on karo — Alt+C'}
          style={{ background: isHighContrast ? 'var(--accent)' : 'transparent',
            border:'1px solid var(--border)', borderRadius:7,
            color: isHighContrast ? 'white' : 'var(--muted)',
            padding:'5px 11px', cursor:'pointer', fontSize:'0.8rem', minHeight:34 }}>
          ◑
        </button>
      </header>

      {/* ── Body ── */}
      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
        {sidebarOpen && (
          <ModuleSidebar progress={progress} onModuleSelect={() => setActiveTab(TABS.LESSON)} />
        )}

        <main id="learn-main" tabIndex={-1} style={{ flex:1, overflow:'hidden',
          display:'flex', flexDirection:'column', background:'var(--ink)' }}
          aria-label={`${currentMod.title} — ${activeTab}`}>

          {activeTab === TABS.LESSON && (
            <LessonView key={`lesson-${currentModule}`} onDifficultyChange={handleDifficultyChange} />
          )}
          {activeTab === TABS.QUIZ && (
            <QuizView key={`quiz-${currentModule}`} onDifficultyChange={handleDifficultyChange} />
          )}
          {activeTab === TABS.CODE && (
            <CodeView key={`code-${currentModule}`} />
          )}
        </main>
      </div>

      {/* ── Help overlay ── */}
      {showHelp && (
        <div role="dialog" aria-label="Keyboard shortcuts" aria-modal="true"
          style={{ position:'fixed', inset:0, zIndex:100,
            background:'rgba(0,0,0,0.72)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
          onClick={e => { if (e.target===e.currentTarget) setShowHelp(false) }}>
          <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:20,
            padding:'28px 32px', maxWidth:520, width:'100%', maxHeight:'82vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:22 }}>
              <h2 style={{ fontFamily:'Syne, sans-serif', fontWeight:700, fontSize:'1.25rem', color:'var(--text)', margin:0 }}>
                Keyboard Shortcuts
              </h2>
              <button autoFocus onClick={() => setShowHelp(false)} aria-label="Help band karo"
                style={{ background:'transparent', border:'1px solid var(--border)', borderRadius:7,
                  color:'var(--muted)', padding:'4px 12px', cursor:'pointer', minHeight:36 }}>✕</button>
            </div>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <tbody>
                {SHORTCUTS.map((s,i) => (
                  <tr key={i} style={{ borderBottom:'1px solid var(--border)' }}>
                    <td style={{ padding:'9px 0', width:'36%' }}>
                      <kbd style={{ background:'var(--border)', borderRadius:6, padding:'2px 9px',
                        fontFamily:'JetBrains Mono, monospace', fontSize:'0.8rem', color:'var(--accent)' }}>
                        {s.key}
                      </kbd>
                    </td>
                    <td style={{ padding:'9px 0', color:'var(--text)', fontSize:'0.86rem', lineHeight:1.5 }}>
                      {s.action}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ color:'var(--muted)', fontSize:'0.78rem', marginTop:18, textAlign:'center' }}>
              Escape ya bahar click karo band karne ke liye
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
