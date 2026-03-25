import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useTTS } from '../hooks/useTTS'
import { useSTT } from '../hooks/useSTT'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [username, setUsername] = useState(() => localStorage.getItem('ac_username') || '')
  const [sessionId] = useState(() => {
    let id = localStorage.getItem('ac_session_id')
    if (!id) { id = uuidv4(); localStorage.setItem('ac_session_id', id) }
    return id
  })
  const [currentModule, setCurrentModule]     = useState(1)
  const [difficultyLevel, setDifficultyLevel] = useState('beginner')
  const [lessonState, setLessonState]         = useState('idle')
  const [isHighContrast, setIsHighContrast]   = useState(
    () => localStorage.getItem('ac_high_contrast') === 'true'
  )
  const [fontSize, setFontSize] = useState(
    () => parseInt(localStorage.getItem('ac_font_size') || '1')
  )

  // Tracks the last thing spoken so R-key replay works from anywhere,
  // including streaming lessons in LessonView.
  const lastSpokenRef = useRef('')

  const tts = useTTS()
  const stt = useSTT()

  useEffect(() => {
    document.documentElement.classList.toggle('high-contrast', isHighContrast)
  }, [isHighContrast])

  useEffect(() => {
    const scales = [0.9, 1, 1.2, 1.4]
    document.documentElement.style.setProperty('--font-scale', scales[fontSize] ?? 1)
  }, [fontSize])

  const saveUsername = useCallback((name) => {
    setUsername(name)
    localStorage.setItem('ac_username', name)
  }, [])

  // Used by components that speak via tts.speak() — stores text for replay
  const speakAndStore = useCallback(async (text) => {
    if (!text) return
    lastSpokenRef.current = text
    await tts.speak(text)
  }, [tts])

  // Used by LessonView to update what "last spoken" is during/after streaming,
  // without triggering a re-speak (streaming TTS handles the actual audio).
  const setLastSpoken = useCallback((text) => {
    if (text) lastSpokenRef.current = text
  }, [])

  // R-key handler — replays whatever was last spoken
  const replayLast = useCallback(() => {
    if (lastSpokenRef.current) tts.speak(lastSpokenRef.current)
  }, [tts])

  const toggleHighContrast = useCallback(() => {
    setIsHighContrast(prev => {
      const next = !prev
      localStorage.setItem('ac_high_contrast', String(next))
      return next
    })
  }, [])

  const changeFontSize = useCallback((size) => {
    const c = Math.max(0, Math.min(3, size))
    setFontSize(c)
    localStorage.setItem('ac_font_size', String(c))
  }, [])

  return (
    <AppContext.Provider value={{
      username, sessionId, saveUsername,
      currentModule, setCurrentModule,
      difficultyLevel, setDifficultyLevel,
      lessonState, setLessonState,
      isHighContrast, toggleHighContrast,
      fontSize, changeFontSize,
      tts, stt,
      speakAndStore,
      setLastSpoken,   // ← new: for streaming lesson text
      replayLast,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be inside AppProvider')
  return ctx
}