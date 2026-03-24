// Re-exports from useTTS for backward compat — now same implementation
import { stopAllAudio } from '../hooks/useTTS'

export async function browserSpeak(text, onDone, rate = 0.95) {
  if (!text?.trim() || !window.speechSynthesis) { onDone?.(); return }
  window.speechSynthesis.cancel()
  await new Promise(r => setTimeout(r, 60))
  const u = new SpeechSynthesisUtterance(text)
  u.rate = rate; u.pitch = 1.0; u.volume = 1.0
  u.lang = 'hi-IN'
  u.onend = () => onDone?.()
  u.onerror = () => onDone?.()
  window.speechSynthesis.speak(u)
}

export function browserStop() {
  stopAllAudio()
}
