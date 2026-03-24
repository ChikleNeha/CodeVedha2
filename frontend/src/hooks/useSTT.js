// Web Speech API STT — SpeechRecognition with continuous=false, interimResults
import { useState, useRef, useCallback, useEffect } from 'react'

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition

export function useSTT() {
  const [transcript, setTranscript] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [isSupported] = useState(() => !!SpeechRecognition)
  const recognizerRef = useRef(null)
  const callbackRef = useRef(null)
  const interimRef = useRef('')

  const startListening = useCallback((onFinalResult) => {
    if (!isSupported || isListening) return
    callbackRef.current = onFinalResult
    setTranscript('')
    interimRef.current = ''

    const rec = new SpeechRecognition()
    rec.lang = 'hi-IN'           // Hinglish — hi-IN picks up English words too
    rec.continuous = false
    rec.interimResults = true
    rec.maxAlternatives = 1
    recognizerRef.current = rec

    rec.onstart = () => setIsListening(true)

    rec.onresult = (e) => {
      let interim = ''
      let final = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) final += t
        else interim += t
      }
      if (final) { interimRef.current = final; setTranscript(final) }
      else setTranscript(interim)
    }

    rec.onend = () => {
      setIsListening(false)
      const result = interimRef.current || transcript
      if (result.trim() && callbackRef.current) {
        callbackRef.current(result.trim())
      }
    }

    rec.onerror = (e) => {
      console.error('STT error:', e.error)
      setIsListening(false)
      if (e.error !== 'no-speech' && e.error !== 'aborted' && callbackRef.current) {
        callbackRef.current(interimRef.current || '')
      }
    }

    rec.start()
  }, [isSupported, isListening, transcript])

  const stopListening = useCallback(() => {
    if (recognizerRef.current) {
      try { recognizerRef.current.stop() } catch (e) {}
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => () => {
    if (recognizerRef.current) try { recognizerRef.current.abort() } catch (e) {}
  }, [])

  return { transcript, isListening, isSupported, startListening, stopListening }
}
