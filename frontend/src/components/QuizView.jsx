import { useState, useEffect, useRef, useCallback } from 'react'
import { useApp } from '../context/AppContext'
import { getQuiz, submitQuizResult, updateProgress } from '../utils/api'
import { stopAllAudio, waitUntilDone } from '../hooks/useTTS'
import { MODULES } from '../data/curriculum.js'

const S = { IDLE: 'idle', LOADING: 'loading', QUESTION: 'question', DONE: 'done' }

// ─────────────────────────────────────────────────────────────────────────────
// QUIZ CACHE — saves to IndexedDB so quizzes aren't regenerated on every attempt
// Key: `quiz__{moduleId}__{difficulty}`
// ─────────────────────────────────────────────────────────────────────────────
const DB_NAME    = 'quizCache'
const DB_STORE   = 'quizzes'
const DB_VERSION = 1

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: 'key' })
      }
    }
    req.onsuccess = (e) => resolve(e.target.result)
    req.onerror   = (e) => reject(e.target.error)
  })
}

async function getCachedQuiz(moduleId, difficulty) {
  try {
    const db  = await openDB()
    const key = `quiz__${moduleId}__${difficulty}`
    return new Promise((resolve) => {
      const tx  = db.transaction(DB_STORE, 'readonly')
      const req = tx.objectStore(DB_STORE).get(key)
      req.onsuccess = (e) => resolve(e.target.result?.questions || null)
      req.onerror   = () => resolve(null)
    })
  } catch { return null }
}

async function setCachedQuiz(moduleId, difficulty, questions) {
  try {
    const db  = await openDB()
    const key = `quiz__${moduleId}__${difficulty}`
    return new Promise((resolve) => {
      const tx  = db.transaction(DB_STORE, 'readwrite')
      tx.objectStore(DB_STORE).put({ key, questions, cachedAt: Date.now() })
      tx.oncomplete = () => resolve(true)
      tx.onerror    = () => resolve(false)
    })
  } catch { return false }
}

// ─────────────────────────────────────────────────────────────────────────────
// VOICE MATCHING — user says "one / two / three / four" in English only
// We use en-US recognition so it's reliable, then map the word to an index.
// ─────────────────────────────────────────────────────────────────────────────
function matchVoice(transcript) {
  // Normalise: lowercase, strip punctuation
  const t = transcript.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
  console.log('[Voice] normalised:', t)

  // Exact / contained word match
  if (/\bone\b/.test(t))   return 0
  if (/\btwo\b/.test(t))   return 1
  if (/\bthree\b/.test(t)) return 2
  if (/\bfour\b/.test(t))  return 3

  // Digit fallback (in case browser returns "1" "2" etc.)
  if (/\b1\b/.test(t)) return 0
  if (/\b2\b/.test(t)) return 1
  if (/\b3\b/.test(t)) return 2
  if (/\b4\b/.test(t)) return 3

  // Common mis-recognitions
  if (/\bwon\b/.test(t) || /\bun\b/.test(t))  return 0   // "one" → "won"
  if (/\btoo\b/.test(t) || /\bto\b/.test(t))  return 1   // "two" → "to/too"
  if (/\bfree\b/.test(t) || /\btree\b/.test(t)) return 2 // "three" → "free/tree"
  if (/\bfor\b/.test(t)  || /\bfore\b/.test(t)) return 3 // "four" → "for"

  return null
}

const DIFF_COLOR = {
  beginner:     'text-green-400 border-green-400/40 bg-green-400/10',
  intermediate: 'text-purple-400 border-purple-400/40 bg-purple-400/10',
  advanced:     'text-pink-400 border-pink-400/40 bg-pink-400/10',
}

function Kbd({ children }) {
  return (
    <span className="bg-white/15 rounded px-1.5 py-0.5 font-mono text-[10px] text-white/60 leading-none">
      {children}
    </span>
  )
}

export default function QuizView({ onDifficultyChange, onNavigate }) {
  const { sessionId, currentModule, difficultyLevel, setDifficultyLevel, tts } = useApp()
  const mod = MODULES.find(m => m.id === currentModule) || MODULES[0]

  // ── STATE ─────────────────────────────────────────────────────────────────
  const [uiState, setUiState]         = useState(S.IDLE)
  const [questions, setQuestions]     = useState([])
  const [idx, setIdx]                 = useState(0)
  const [score, setScore]             = useState(0)
  const [selected, setSelected]       = useState(null)
  const [feedback, setFeedback]       = useState(null)
  const [finalMsg, setFinalMsg]       = useState('')
  const [wrongTopics, setWrongTopics] = useState([])
  const [diffBadge, setDiffBadge]     = useState(difficultyLevel)
  const [badgeAnim, setBadgeAnim]     = useState(false)
  const [micActive, setMicActive]     = useState(false)
  const [micStatus, setMicStatus]     = useState('')
  const [fromCache, setFromCache]     = useState(false)  // shows "from cache" badge

  // ── REFS ─────────────────────────────────────────────────────────────────
  const stateRef       = useRef(S.IDLE)
  const questionsRef   = useRef([])
  const idxRef         = useRef(0)
  const scoreRef       = useRef(0)
  const wrongRef       = useRef([])
  const diffRef        = useRef(difficultyLevel)
  const selectedRef    = useRef(null)
  const micRef         = useRef(null)
  const micActiveRef   = useRef(false)
  const handleAnswerRef = useRef(null)

  useEffect(() => { selectedRef.current = selected }, [selected])
  useEffect(() => { diffRef.current = difficultyLevel; setDiffBadge(difficultyLevel) }, [difficultyLevel])

  // ── RESET ON MODULE CHANGE ────────────────────────────────────────────────
  useEffect(() => {
    stopAllAudio()
    _stopMic()
    stateRef.current = S.IDLE;  setUiState(S.IDLE)
    questionsRef.current = [];  setQuestions([])
    idxRef.current = 0;         setIdx(0)
    scoreRef.current = 0;       setScore(0)
    wrongRef.current = [];      setWrongTopics([])
    selectedRef.current = null; setSelected(null)
    setFeedback(null);          setFinalMsg('')
    setFromCache(false)
  }, [currentModule]) // eslint-disable-line

  // ── MIC ──────────────────────────────────────────────────────────────────
  function _stopMic() {
    if (micRef.current) { try { micRef.current.stop() } catch (_) {} micRef.current = null }
    micActiveRef.current = false
    setMicActive(false)
    setMicStatus('')
  }

  const startMic = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      tts.speak('Aapke browser mein voice input support nahi hai.')
      return
    }
    if (micActiveRef.current) { _stopMic(); return }

    stopAllAudio()
    const rec = new SR()

    // en-US gives the most reliable single-word English recognition
    rec.lang            = 'en-US'
    rec.interimResults  = true
    rec.maxAlternatives = 5
    rec.continuous      = false

    rec.onstart = () => {
      micActiveRef.current = true
      setMicActive(true)
      setMicStatus('Listening...')
    }

    rec.onend = () => {
      micActiveRef.current = false
      setMicActive(false)
    }

    rec.onerror = (e) => {
      _stopMic()
      if (e.error === 'no-speech') {
        setMicStatus('Nothing heard — try again')
      } else if (e.error === 'not-allowed') {
        tts.speak('Microphone permission denied. Please allow microphone access.')
      } else {
        console.error('[Voice] error:', e.error)
        setMicStatus('Error — press Space to retry')
      }
    }

    rec.onresult = (event) => {
      const last = event.results[event.results.length - 1]

      // Grab all alternatives
      const alts = Array.from({ length: last.length }, (_, i) => last[i].transcript)
      console.log('[Voice] alternatives:', alts)
      setMicStatus(`Heard: "${alts[0]}"`)

      if (last.isFinal) {
        _stopMic()

        let matched = null
        for (const alt of alts) {
          matched = matchVoice(alt)
          if (matched !== null) break
        }
        console.log('[Voice] matched option index:', matched)

        if (matched !== null) {
          setMicStatus(`✓ "${alts[0]}" → Option ${matched + 1}`)
          handleAnswerRef.current?.(matched)
        } else {
          setMicStatus(`"${alts[0]}" not matched`)
          tts.speak('Please say one, two, three, or four.')
        }
      }
    }

    micRef.current = rec
    try { rec.start() } catch (e) {
      console.error('[Voice] start error:', e)
      _stopMic()
    }
  }, [tts])

  // ── SPEAK HELPERS ─────────────────────────────────────────────────────────
  const speakQuestion = useCallback(async (qs, i) => {
    const q = qs[i]
    if (!q) return
    const opts = q.options.map((o, n) => `Option ${n + 1}: ${o}`).join('. ')
    await tts.speak(
      `Question ${i + 1} of ${qs.length}. ${q.question}. ${opts}. ` +
      `Press 1 to ${q.options.length}, or press Space and say one, two, three, or four.`
    )
  }, [tts])

  const replayQuestion = useCallback(() => {
    stopAllAudio(); _stopMic()
    speakQuestion(questionsRef.current, idxRef.current)
  }, [speakQuestion])

  // ── AUTO INTRO ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentModule) return
    const t = setTimeout(() => {
      stopAllAudio()
      tts.speak(`${mod.title} quiz. Press Enter or Space to begin.`)
    }, 800)
    return () => clearTimeout(t)
  }, [currentModule]) // eslint-disable-line

  // ── START QUIZ ────────────────────────────────────────────────────────────
  const startQuiz = useCallback(async () => {
    if (stateRef.current === S.LOADING) return
    _stopMic(); stopAllAudio()

    stateRef.current = S.LOADING
    setUiState(S.LOADING)
    setFromCache(false)

    try {
      // 1. Check IndexedDB cache first
      let qs = await getCachedQuiz(currentModule, diffRef.current)
      let usedCache = false

      if (qs && qs.length) {
        console.log('[Quiz] loaded from cache:', qs.length, 'questions')
        usedCache = true
      } else {
        // 2. Fetch fresh from API
        await tts.speak(`Loading ${mod.title} quiz.`)
        const data = await getQuiz(sessionId, currentModule, diffRef.current)
        qs = data.questions || []

        if (!qs.length) {
          await tts.speak('No questions found. Please try again.')
          stateRef.current = S.IDLE; setUiState(S.IDLE)
          return
        }

        // 3. Save to IndexedDB for next time
        await setCachedQuiz(currentModule, diffRef.current, qs)
        console.log('[Quiz] saved to cache:', qs.length, 'questions')
      }

      questionsRef.current = qs
      idxRef.current = 0
      scoreRef.current = 0
      wrongRef.current = []

      setQuestions(qs)
      setIdx(0)
      setScore(0)
      selectedRef.current = null
      setSelected(null)
      setFeedback(null)
      setWrongTopics([])
      setFromCache(usedCache)

      stateRef.current = S.QUESTION
      setUiState(S.QUESTION)

      if (!usedCache) await tts.speak('Quiz starting!')
      await speakQuestion(qs, 0)

    } catch (err) {
      console.error('[Quiz] load error:', err)
      await tts.speak('Failed to load quiz. Please try again.')
      stateRef.current = S.IDLE; setUiState(S.IDLE)
    }
  }, [sessionId, currentModule, tts, mod, speakQuestion])

  // ── HANDLE ANSWER ─────────────────────────────────────────────────────────
  const handleAnswer = useCallback(async (optIdx) => {
    if (stateRef.current !== S.QUESTION) return
    if (selectedRef.current !== null) return

    const qs = questionsRef.current
    const i  = idxRef.current
    const q  = qs[i]
    if (!q) return

    _stopMic(); stopAllAudio()
    await new Promise(r => setTimeout(r, 60))

    selectedRef.current = optIdx
    setSelected(optIdx)

    const correct = optIdx === q.correct

    if (correct) {
      scoreRef.current++
      setScore(scoreRef.current)
      const msg = `Correct! ${q.explanation}`
      setFeedback({ correct: true, text: msg })
      await tts.speak(msg)
    } else {
      if (!wrongRef.current.includes(q.topic)) {
        wrongRef.current = [...wrongRef.current, q.topic]
        setWrongTopics([...wrongRef.current])
      }
      const msg = `Wrong. The correct answer was: ${q.options[q.correct]}. ${q.explanation}`
      setFeedback({ correct: false, text: msg })
      await tts.speak(msg)
    }

    await new Promise(r => setTimeout(r, 600))
    await waitUntilDone(30000)

    const nextI = i + 1
    if (nextI < qs.length) {
      idxRef.current = nextI
      selectedRef.current = null
      setIdx(nextI)
      setSelected(null)
      setFeedback(null)
      await speakQuestion(qs, nextI)
    } else {
      await finishQuiz()
    }
  }, [tts, speakQuestion]) // eslint-disable-line

  useEffect(() => { handleAnswerRef.current = handleAnswer }, [handleAnswer])

  // ── FINISH QUIZ ───────────────────────────────────────────────────────────
  const finishQuiz = useCallback(async () => {
    stateRef.current = S.DONE
    setUiState(S.DONE)

    const total = questionsRef.current.length
    const sc    = scoreRef.current
    const pct   = total ? Math.round((sc / total) * 100) : 0

    let msg = pct >= 80
      ? `Excellent! ${sc} out of ${total} — ${pct} percent!`
      : pct >= 60
      ? `Good job! ${sc} out of ${total} — ${pct} percent.`
      : `${sc} out of ${total} — ${pct} percent. Keep practicing!`
    setFinalMsg(msg)

    try {
      const res = await submitQuizResult({
        session_id: sessionId, module_id: currentModule,
        score: sc, total, wrong_topics: wrongRef.current,
        current_difficulty: diffRef.current,
      })
      if (res.changed && res.new_difficulty) {
        setDifficultyLevel(res.new_difficulty)
        setDiffBadge(res.new_difficulty)
        setBadgeAnim(true); setTimeout(() => setBadgeAnim(false), 2500)
        onDifficultyChange?.(res.new_difficulty)
        const diffMsg = res.new_difficulty === 'intermediate'
          ? 'Difficulty increased to intermediate!'
          : res.new_difficulty === 'advanced'
          ? 'Difficulty increased to advanced!'
          : 'Back to beginner level for more practice.'
        msg += ` ${diffMsg}`
        setFinalMsg(msg)

        // Invalidate cache for new difficulty level — fresh questions next time
        await setCachedQuiz(currentModule, res.new_difficulty, [])
      }
      await updateProgress({
        session_id: sessionId, module_id: currentModule,
        status: pct >= 60 ? 'completed' : 'in_progress', quiz_score: sc,
      })
    } catch (_) {}

    await tts.speak(msg)
    await tts.speak(
      'Quiz complete. Press Space or Enter to go back to lesson. ' +
      'Press R to retake. Press N for next lesson. Press P for previous lesson.'
    )
  }, [sessionId, currentModule, tts, setDifficultyLevel, onDifficultyChange])

  // ── RESET ─────────────────────────────────────────────────────────────────
  const resetQuiz = useCallback(() => {
    stopAllAudio(); _stopMic()
    stateRef.current = S.IDLE; setUiState(S.IDLE)
    selectedRef.current = null
    setSelected(null); setFeedback(null); setFinalMsg('')
  }, [])

  // ── KEYBOARD ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (['input', 'textarea'].includes(document.activeElement?.tagName?.toLowerCase())) return
      const st = stateRef.current

      if (st === S.IDLE && (e.key === ' ' || e.key === 'Enter'))  { e.preventDefault(); startQuiz() }

      if (st === S.QUESTION) {
        const n = parseInt(e.key)
        if (n >= 1 && n <= 4)               { e.preventDefault(); handleAnswerRef.current?.(n - 1) }
        if (e.key === ' ')                   { e.preventDefault(); startMic() }
        if (e.key === 'r' || e.key === 'R') { e.preventDefault(); replayQuestion() }
      }

      if (st === S.DONE) {
        if (e.key === 'r' || e.key === 'R')     { e.preventDefault(); startQuiz() }
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); resetQuiz() }
        if (e.key === 'n' || e.key === 'N')     { e.preventDefault(); onNavigate?.({ action: 'next' }) }
        if (e.key === 'p' || e.key === 'P')     { e.preventDefault(); onNavigate?.({ action: 'prev' }) }
      }

      if (e.key === 'Escape') { stopAllAudio(); _stopMic() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [startMic, startQuiz, replayQuestion, resetQuiz, onNavigate]) // eslint-disable-line

  // ── DERIVED ───────────────────────────────────────────────────────────────
  const q         = questions[idx]
  const finishPct = questionsRef.current.length
    ? Math.round((scoreRef.current / questionsRef.current.length) * 100) : 0
  const diffClass = DIFF_COLOR[diffBadge] || DIFF_COLOR.beginner

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className="px-4 py-6 max-w-2xl mx-auto" role="region" aria-label="Quiz" aria-live="polite">

      {/* Difficulty badge */}
      <div className="flex justify-end mb-4">
        <span className={`text-xs font-bold px-3 py-1 rounded-full border transition-all duration-500
          ${diffClass} ${badgeAnim ? 'scale-110' : 'scale-100'}`}>
          {diffBadge}
        </span>
      </div>

      {/* ══ IDLE ══ */}
      {uiState === S.IDLE && (
        <div className="flex flex-col items-center text-center pt-10">
          <div className="text-6xl mb-5" aria-hidden="true">🧠</div>
          <h2 className="text-2xl font-bold text-white mb-2">{mod.title} — Quiz</h2>
          <p className="text-gray-400 mb-8 leading-relaxed text-sm max-w-xs">
            5 questions. Listen by audio.<br />
            Press <strong className="text-white">1–4</strong> or press{' '}
            <strong className="text-white">Space</strong> and say{' '}
            <em className="text-purple-300">one, two, three,</em> or{' '}
            <em className="text-purple-300">four</em>.
          </p>
          <button
            autoFocus
            onClick={startQuiz}
            className="px-10 py-4 rounded-2xl bg-purple-600 hover:bg-purple-500 active:scale-95
              text-white font-bold text-lg transition-all duration-150 shadow-lg shadow-purple-900/40
              focus:outline-none focus:ring-2 focus:ring-purple-400"
          >
            🚀 Start Quiz
          </button>
          <p className="text-gray-500 text-xs mt-3">Space or Enter also works</p>
        </div>
      )}

      {/* ══ LOADING ══ */}
      {uiState === S.LOADING && (
        <div className="flex flex-col items-center justify-center pt-20 gap-5">
          <div className="flex gap-1 items-end h-10" aria-hidden="true">
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className="w-2 rounded-full bg-purple-500"
                style={{ height: '100%', animation: `wavebar 0.8s ease-in-out ${i * 0.12}s infinite` }} />
            ))}
          </div>
          <p className="text-gray-400 text-sm">Loading quiz...</p>
          <style>{`@keyframes wavebar{0%,100%{transform:scaleY(.3);opacity:.4}50%{transform:scaleY(1);opacity:1}}`}</style>
        </div>
      )}

      {/* ══ QUESTION ══ */}
      {uiState === S.QUESTION && q && (
        <div>
          {/* Progress */}
          <div className="mb-5">
            <div className="flex justify-between text-xs mb-2">
              <span className="text-gray-400">Question {idx + 1} / {questions.length}</span>
              <div className="flex items-center gap-2">
                {fromCache && (
                  <span className="text-[10px] text-green-400/70 border border-green-400/20 rounded-full px-2 py-0.5">
                    cached
                  </span>
                )}
                <span className="text-purple-400 font-semibold">Score: {score}</span>
              </div>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${((idx + 1) / questions.length) * 100}%`,
                  background: 'linear-gradient(90deg,#a855f7,#ec4899)' }} />
            </div>
          </div>

          {/* Question card */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-4">
            <p className="text-white text-base leading-relaxed font-medium">{q.question}</p>
          </div>

          {/* Feedback */}
          {feedback && (
            <div role="alert" className={`rounded-xl px-4 py-3 mb-4 text-sm leading-relaxed border
              ${feedback.correct
                ? 'bg-green-500/10 border-green-500/30 text-green-400'
                : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
              {feedback.correct ? '✅ ' : '❌ '}{feedback.text}
            </div>
          )}

          {/* Options */}
          <div className="flex flex-col gap-2.5" role="group">
            {q.options.map((opt, i) => {
              const done      = selected !== null
              const isCorrect = i === q.correct
              const isSel     = selected === i
              const base = 'flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left w-full transition-all duration-200 min-h-[52px] '
              const cls  = !done
                ? base + 'bg-white/5 border-white/10 text-white hover:bg-white/10 hover:border-purple-500/50 cursor-pointer'
                : isCorrect ? base + 'bg-green-500/10 border-green-500/50 text-green-400 cursor-default'
                : isSel     ? base + 'bg-red-500/10 border-red-500/50 text-red-400 cursor-default'
                :              base + 'bg-white/3 border-white/5 text-gray-600 cursor-default'
              const numBg = !done ? 'bg-white/10' : isCorrect ? 'bg-green-500/20' : isSel ? 'bg-red-500/20' : 'bg-white/5'
              return (
                <button key={i} onClick={() => handleAnswer(i)} disabled={done} className={cls}>
                  <span className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${numBg}`}>
                    {done && isCorrect ? '✓' : done && isSel ? '✗' : i + 1}
                  </span>
                  <span className="text-sm leading-snug">{opt}</span>
                </button>
              )
            })}
          </div>

          {/* Mic row */}
          <div className="mt-5 flex flex-col items-center gap-2">
            <button onClick={startMic}
              className={`flex items-center gap-2.5 px-6 py-3 rounded-xl border-2 font-semibold text-sm
                transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-400
                ${micActive
                  ? 'bg-red-500/10 border-red-500/60 text-red-400 shadow-[0_0_20px_rgba(239,68,68,0.25)] animate-pulse'
                  : 'bg-purple-500/10 border-purple-500/40 text-purple-400 hover:bg-purple-500/20'}`}>
              <span className="text-lg">{micActive ? '🔴' : '🎙️'}</span>
              {micActive ? 'Listening...' : 'Say your answer'}
            </button>

            {/* Mic instruction — always visible when mic is available */}
            {!micActive && (
              <p className="text-xs text-purple-300/60 text-center">
                Say <strong className="text-purple-300">one</strong>,{' '}
                <strong className="text-purple-300">two</strong>,{' '}
                <strong className="text-purple-300">three</strong>, or{' '}
                <strong className="text-purple-300">four</strong>
              </p>
            )}

            {micStatus && (
              <p className={`text-xs italic transition-colors ${micActive ? 'text-purple-300' : 'text-gray-400'}`}>
                {micStatus}
              </p>
            )}

            <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap justify-center mt-0.5">
              {[['1–4', 'answer'], ['Space', 'voice'], ['R', 'replay']].map(([k, v]) => (
                <span key={k} className="flex items-center gap-1">
                  <kbd className="bg-white/10 border border-white/20 rounded px-1.5 py-0.5 font-mono text-gray-300 text-[10px]">{k}</kbd>
                  <span>{v}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══ DONE ══ */}
      {uiState === S.DONE && (
        <div className="flex flex-col items-center text-center pt-8">
          <div className="text-6xl mb-4" aria-hidden="true">
            {finishPct >= 80 ? '🏆' : finishPct >= 60 ? '🎉' : '💪'}
          </div>
          <h2 className="text-2xl font-bold text-white mb-1">Quiz Complete!</h2>
          <p className="text-5xl font-extrabold mb-2"
            style={{ background: 'linear-gradient(135deg,#a855f7,#ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {scoreRef.current}/{questionsRef.current.length}
          </p>
          <span className={`text-sm font-bold px-4 py-1.5 rounded-full border mb-4 transition-all duration-500
            ${diffClass} ${badgeAnim ? 'scale-110' : 'scale-100'}`}>
            Level: {diffBadge}
          </span>
          <p className="text-gray-300 text-sm leading-relaxed max-w-sm mb-5">{finalMsg}</p>

          {wrongTopics.length > 0 && (
            <div className="bg-yellow-500/8 border border-yellow-500/25 rounded-xl px-4 py-3 mb-5 text-left max-w-sm w-full">
              <p className="text-yellow-400 font-semibold text-xs mb-1">Topics to review:</p>
              <p className="text-gray-300 text-sm">{wrongTopics.join(', ')}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-2.5 justify-center mb-6">
            <button autoFocus onClick={startQuiz}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500
                text-white font-semibold text-sm transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-purple-400">
              🔄 Retake <Kbd>R</Kbd>
            </button>
            <button onClick={resetQuiz}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/8 hover:bg-white/12
                border border-white/15 text-gray-300 font-semibold text-sm transition-all active:scale-95">
              ← Back <Kbd>Space</Kbd>
            </button>
            {onNavigate && (<>
              <button onClick={() => onNavigate({ action: 'prev' })}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/8 hover:bg-white/12
                  border border-white/15 text-gray-300 font-semibold text-sm transition-all active:scale-95">
                ◀ Prev <Kbd>P</Kbd>
              </button>
              <button onClick={() => onNavigate({ action: 'next' })}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/8 hover:bg-white/12
                  border border-white/15 text-gray-300 font-semibold text-sm transition-all active:scale-95">
                Next ▶ <Kbd>N</Kbd>
              </button>
            </>)}
          </div>

          <div className="bg-white/4 border border-white/10 rounded-xl p-4 max-w-xs w-full">
            <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-widest mb-3">Keyboard Shortcuts</p>
            <div className="flex flex-col gap-2.5">
              {[['Space / Enter','Back to lesson'],['R','Retake quiz'],['N','Next quiz'],['P','Previous quiz']].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between">
                  <kbd className="bg-white/10 border border-white/20 rounded px-2 py-0.5 font-mono text-purple-300 text-xs">{k}</kbd>
                  <span className="text-gray-400 text-xs">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}