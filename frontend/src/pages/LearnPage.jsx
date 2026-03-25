import { useState, useEffect, useCallback, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { stopAllAudio } from '../hooks/useTTS'
import { getProgress } from '../utils/api'
import ModuleSidebar from '../components/ModuleSidebar'
import LessonView from '../components/LessonView'
import QuizView from '../components/QuizView'
import CodeView from '../components/CodeView'
import { MODULES, SHORTCUTS, DIFFICULTY_LABELS } from '../data/curriculum.js'

const TABS = { LESSON: 'lesson', QUIZ: 'quiz', CODE: 'code' }

export default function LearnPage() {
  const {
    username, sessionId, currentModule, setCurrentModule,
    difficultyLevel, setDifficultyLevel,
    isHighContrast, toggleHighContrast,
    changeFontSize, replayLast, tts
  } = useApp()

  const [activeTab, setActiveTab]     = useState(TABS.LESSON)
  const [progress, setProgress]       = useState([])
  const [showHelp, setShowHelp]       = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [diffBadge, setDiffBadge]     = useState(difficultyLevel)
  const [badgeAnim, setBadgeAnim]     = useState(false)
  const [readingHelp, setReadingHelp] = useState(false)

  const activeTabRef     = useRef(TABS.LESSON)
  const currentModuleRef = useRef(currentModule)
  const helpReadingRef   = useRef(false)

  useEffect(() => { activeTabRef.current = activeTab },       [activeTab])
  useEffect(() => { currentModuleRef.current = currentModule }, [currentModule])
  useEffect(() => { setDiffBadge(difficultyLevel) },          [difficultyLevel])

  // ── PROGRESS ───────────────────────────────────────────────────────────────
  const refreshProgress = useCallback(() => {
    if (!sessionId) return
    getProgress(sessionId)
      .then(d => setProgress(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [sessionId])

  useEffect(() => { refreshProgress() }, [sessionId, currentModule, refreshProgress])

  // ── DIFFICULTY CHANGE ──────────────────────────────────────────────────────
  const handleDifficultyChange = useCallback((newDiff) => {
    setDifficultyLevel(newDiff)
    setDiffBadge(newDiff)
    setBadgeAnim(true)
    setTimeout(() => setBadgeAnim(false), 2500)
    const msg = newDiff === 'intermediate' ? 'Difficulty badh gayi — intermediate!'
              : newDiff === 'advanced'     ? 'Difficulty badh gayi — advanced!'
              : 'Wapas beginner level pe practice karte hain.'
    tts.stopAndSpeak(msg)   // interrupt lesson audio, speak badge change
    refreshProgress()
  }, [setDifficultyLevel, tts, refreshProgress])

  // ── PROGRESS SUMMARY ───────────────────────────────────────────────────────
  const speakProgressSummary = useCallback(async () => {
    const completed = progress.filter(p => p.status === 'completed').length
    const scores    = progress.filter(p => p.quiz_score > 0).map(p => p.quiz_score)
    const avg       = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
    await tts.speak(
      `Aapne ${completed} mein se 5 modules complete kiye hain. ` +
      `Average quiz score ${avg} out of 5 hai.`
    )
  }, [progress, tts])

  // ── HELP AUDIO ─────────────────────────────────────────────────────────────
  const speakHelp = useCallback(async () => {
    if (helpReadingRef.current) return
    helpReadingRef.current = true
    setReadingHelp(true)

    // Stop whatever was playing, then read shortcuts sequentially
    stopAllAudio()
    await new Promise(r => setTimeout(r, 120))   // let cancel settle

    await tts.speak('Keyboard shortcuts.')

    for (const s of SHORTCUTS) {
      if (!helpReadingRef.current) break          // user closed/ESC mid-reading
      await tts.speak(`${s.key}. ${s.action}.`)  // each shortcut is its own speak() call
    }

    if (helpReadingRef.current) {
      await tts.speak('End of shortcuts. Press Escape to close.')
    }

    helpReadingRef.current = false
    setReadingHelp(false)
  }, [tts])

  const openHelp = useCallback(() => {
    setShowHelp(true)
    speakHelp()
  }, [speakHelp])

  const closeHelp = useCallback(() => {
    helpReadingRef.current = false
    setReadingHelp(false)
    stopAllAudio()
    setShowHelp(false)
  }, [])

  // ── GLOBAL KEYBOARD ────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = async (e) => {
      const typing = ['input', 'textarea'].includes(document.activeElement?.tagName?.toLowerCase())

      if (e.key === 'Escape') { closeHelp(); return }
      if (typing) return

      // All key-triggered speech uses stopAndSpeak so it cuts through any ongoing audio
      if (e.key === 'l' || e.key === 'L') { e.preventDefault(); setActiveTab(TABS.LESSON); tts.stopAndSpeak('Lesson tab') }
      if (e.key === 'q' || e.key === 'Q') { e.preventDefault(); setActiveTab(TABS.QUIZ);   tts.stopAndSpeak('Quiz tab') }
      if (e.key === 'x' || e.key === 'X') { e.preventDefault(); setActiveTab(TABS.CODE);   tts.stopAndSpeak('Code tab') }
      if (e.key === 'r' || e.key === 'R') { e.preventDefault(); replayLast() }

      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault()
        showHelp ? closeHelp() : openHelp()
      }

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        const mod  = currentModuleRef.current
        const next = Math.min(5, mod + 1)
        if (next !== mod) {
          setCurrentModule(next)
          const m = MODULES.find(x => x.id === next)
          if (m) tts.stopAndSpeak(`${m.icon} ${m.title}`)
        }
      }

      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault()
        const mod = currentModuleRef.current
        if (activeTabRef.current !== TABS.QUIZ) {
          const prev = Math.max(1, mod - 1)
          if (prev !== mod) {
            setCurrentModule(prev)
            const m = MODULES.find(x => x.id === prev)
            if (m) tts.stopAndSpeak(`${m.icon} ${m.title}`)
          } else {
            await speakProgressSummary()
          }
        }
      }

      if (e.altKey && e.key === 'c') {
        e.preventDefault()
        toggleHighContrast()
        tts.stopAndSpeak(isHighContrast ? 'High contrast off' : 'High contrast on')
      }

      if (e.altKey && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault()
        changeFontSize(parseInt(e.key) - 1)
        tts.stopAndSpeak(`Font size ${e.key}`)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isHighContrast, toggleHighContrast, changeFontSize, replayLast, tts,
      setCurrentModule, speakProgressSummary, showHelp, openHelp, closeHelp]) // eslint-disable-line

  const DIFF_COLORS = { beginner: '#4ade80', intermediate: '#a855f7', advanced: '#ec4899' }
  const currentMod  = MODULES.find(m => m.id === currentModule) || MODULES[0]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh',
      background: 'var(--ink)', color: 'var(--text)', overflow: 'hidden' }}>

      <a href="#learn-main" className="skip-link">Main content pe jao</a>
      <div role="status"  aria-live="polite"    aria-atomic="true" className="sr-only" />
      <div role="alert"   aria-live="assertive" aria-atomic="true" className="sr-only" />

      {/* ── Top nav ── */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 18px',
        height: 54, background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        flexShrink: 0, zIndex: 20 }}>

        <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: '1.1rem' }} aria-label="CodeVedha">
          <span className="gradient-text">CodeVedha</span>
        </div>

        <button onClick={() => setSidebarOpen(p => !p)}
          aria-label={sidebarOpen ? 'Sidebar band karo' : 'Sidebar kholo'}
          style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 7,
            color: 'var(--muted)', padding: '5px 10px', cursor: 'pointer', fontSize: '0.95rem', minHeight: 36 }}>
          ☰
        </button>

        <nav aria-label="Content tabs" style={{ display: 'flex', gap: 4 }}>
          {[
            { id: TABS.LESSON, label: '📖 Lesson', key: 'L' },
            { id: TABS.QUIZ,   label: '🧠 Quiz',   key: 'Q' },
            { id: TABS.CODE,   label: '💻 Code',   key: 'X' },
          ].map(tab => (
            <button key={tab.id} role="tab" aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              aria-label={`${tab.label} — shortcut ${tab.key}`}
              style={{ background: activeTab === tab.id ? 'rgba(168,85,247,0.15)' : 'transparent',
                border: activeTab === tab.id ? '1px solid var(--accent)' : '1px solid transparent',
                borderRadius: 8, color: activeTab === tab.id ? 'var(--accent)' : 'var(--muted)',
                padding: '5px 13px', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                fontWeight: activeTab === tab.id ? 600 : 400, fontSize: '0.83rem',
                minHeight: 34, transition: 'all 0.15s' }}>
              {tab.label}
            </button>
          ))}
        </nav>

        <div style={{ flex: 1 }} />

        {username && <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>👤 {username}</span>}

        <span aria-label={`Difficulty: ${diffBadge}`}
          style={{ background: badgeAnim ? `${DIFF_COLORS[diffBadge]}22` : 'rgba(168,85,247,0.1)',
            border: `1px solid ${badgeAnim ? DIFF_COLORS[diffBadge] : 'rgba(168,85,247,0.3)'}`,
            color: badgeAnim ? DIFF_COLORS[diffBadge] : 'var(--accent)',
            borderRadius: 20, padding: '3px 11px', fontSize: '0.76rem', fontWeight: 600,
            transition: 'all 0.5s', transform: badgeAnim ? 'scale(1.15)' : 'scale(1)' }}>
          {DIFFICULTY_LABELS[diffBadge] || diffBadge}
        </span>

        <button onClick={() => showHelp ? closeHelp() : openHelp()}
          aria-label="Keyboard shortcuts — H key" aria-expanded={showHelp}
          style={{ background: showHelp ? 'rgba(168,85,247,0.15)' : 'transparent',
            border: `1px solid ${showHelp ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 7, color: showHelp ? 'var(--accent)' : 'var(--muted)',
            padding: '5px 11px', cursor: 'pointer', fontSize: '0.8rem', minHeight: 34,
            transition: 'all 0.15s' }}>
          ? Help
        </button>

        <button onClick={toggleHighContrast} aria-pressed={isHighContrast}
          aria-label={isHighContrast ? 'High contrast band karo' : 'High contrast on karo — Alt+C'}
          style={{ background: isHighContrast ? 'var(--accent)' : 'transparent',
            border: '1px solid var(--border)', borderRadius: 7,
            color: isHighContrast ? 'white' : 'var(--muted)',
            padding: '5px 11px', cursor: 'pointer', fontSize: '0.8rem', minHeight: 34 }}>
          ◑
        </button>
      </header>

      {/* ── Body ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {sidebarOpen && (
          <ModuleSidebar progress={progress} onModuleSelect={() => setActiveTab(TABS.LESSON)} />
        )}
        <main id="learn-main" tabIndex={-1}
          style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--ink)' }}
          aria-label={`${currentMod.title} — ${activeTab}`}>
          {activeTab === TABS.LESSON && <LessonView key={`lesson-${currentModule}`} onDifficultyChange={handleDifficultyChange} />}
          {activeTab === TABS.QUIZ   && <QuizView   key={`quiz-${currentModule}`}   onDifficultyChange={handleDifficultyChange} />}
          {activeTab === TABS.CODE   && <CodeView   key={`code-${currentModule}`} />}
        </main>
      </div>

      {/* ── Help overlay ── */}
      {showHelp && (
        <div role="dialog" aria-label="Keyboard shortcuts" aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-5"
          style={{ background: 'rgba(0,0,0,0.75)' }}
          onClick={e => { if (e.target === e.currentTarget) closeHelp() }}>

          <div className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-white/10"
            style={{ background: 'var(--card)' }}>

            {/* Header */}
            <div className="flex items-center justify-between px-7 pt-6 pb-4 border-b border-white/8 sticky top-0"
              style={{ background: 'var(--card)' }}>
              <div>
                <h2 className="text-lg font-bold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>
                  ⌨️ Keyboard Shortcuts
                </h2>
                <div className="flex items-center gap-2 mt-1 h-5">
                  {readingHelp ? (
                    <>
                      <div className="flex gap-0.5 items-end h-3.5">
                        {[0, 1, 2].map(i => (
                          <div key={i} className="w-0.5 rounded-full bg-purple-400"
                            style={{ height: '100%', animation: `waveHelp 0.7s ease-in-out ${i * 0.15}s infinite` }} />
                        ))}
                      </div>
                      <span className="text-purple-400 text-xs">Reading aloud...</span>
                      <button
                        onClick={() => { helpReadingRef.current = false; setReadingHelp(false); stopAllAudio() }}
                        className="text-xs text-gray-500 hover:text-white underline transition-colors ml-1">
                        stop
                      </button>
                    </>
                  ) : (
                    <span className="text-gray-500 text-xs">Press H to read aloud again</span>
                  )}
                </div>
              </div>
              <button autoFocus onClick={closeHelp} aria-label="Close help"
                className="flex items-center justify-center w-8 h-8 rounded-lg border border-white/10
                  text-gray-400 hover:text-white hover:border-white/30 transition-all text-sm">
                ✕
              </button>
            </div>

            {/* Shortcuts list */}
            <div className="px-7 py-4">
              <table className="w-full border-collapse">
                <tbody>
                  {SHORTCUTS.map((s, i) => (
                    <tr key={i} className="border-b border-white/6">
                      <td className="py-3 w-2/5">
                        <kbd className="inline-block bg-white/8 border border-white/15 rounded-md
                          px-2.5 py-1 font-mono text-[0.78rem] text-purple-300 leading-none">
                          {s.key}
                        </kbd>
                      </td>
                      <td className="py-3 text-gray-300 text-sm leading-relaxed">{s.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-7 pb-5 pt-1">
              <p className="text-center text-gray-600 text-xs">
                Press{' '}
                <kbd className="bg-white/8 border border-white/15 rounded px-1.5 py-0.5 font-mono text-gray-400 text-[10px]">Esc</kbd>
                {' '}or click outside to close
              </p>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes waveHelp {
          0%, 100% { transform: scaleY(0.3); opacity: 0.5; }
          50%       { transform: scaleY(1);   opacity: 1;   }
        }
      `}</style>
    </div>
  )
}