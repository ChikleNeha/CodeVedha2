import { useApp } from '../context/AppContext'
import { MODULES } from '../data/curriculum.js'

function StatusIcon({ status }) {
  if (status === 'completed')   return <span aria-hidden="true" style={{ color:'#4ade80', fontSize:'0.9rem' }}>✓</span>
  if (status === 'in_progress') return <span aria-hidden="true" style={{ color:'var(--accent)', fontSize:'0.9rem' }}>◑</span>
  return <span aria-hidden="true" style={{ color:'var(--muted)', fontSize:'0.9rem' }}>○</span>
}

export default function ModuleSidebar({ progress = [], onModuleSelect }) {
  const { currentModule, setCurrentModule, tts } = useApp()

  const getProgress = (id) => progress.find(p => p.module_id === id) || null
  const completedCount = progress.filter(p => p.status === 'completed').length

  const handleSelect = (mod) => {
    setCurrentModule(mod.id)
    tts.speak(`${mod.icon} ${mod.title}`)
    onModuleSelect?.(mod.id)
  }

  return (
    <nav aria-label="Python modules — up/down arrow ya click karo"
      style={{ width:264, flexShrink:0, background:'var(--surface)',
        borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column',
        height:'100%', overflowY:'auto' }}>

      {/* Header + progress bar */}
      <div style={{ padding:'18px 16px 12px', borderBottom:'1px solid var(--border)' }}>
        <h2 style={{ fontFamily:'Syne, sans-serif', fontWeight:700, fontSize:'0.95rem', color:'var(--text)', margin:0 }}>
          Modules
        </h2>
        <div role="progressbar" aria-valuenow={completedCount} aria-valuemin={0} aria-valuemax={5}
          aria-label={`${completedCount} of 5 modules complete`} style={{ marginTop:10 }}>
          <div style={{ height:5, background:'var(--border)', borderRadius:3, overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${(completedCount/5)*100}%`,
              background:'linear-gradient(90deg,var(--accent),var(--accent2))',
              borderRadius:3, transition:'width 0.5s ease' }} />
          </div>
          <p style={{ color:'var(--muted)', fontSize:'0.76rem', marginTop:4 }}>{completedCount}/5 complete</p>
        </div>
      </div>

      {/* Module list */}
      <ul role="listbox" aria-label="Module select karo"
        style={{ listStyle:'none', margin:0, padding:'6px 0', flex:1 }}>
        {MODULES.map((mod) => {
          const prog     = getProgress(mod.id)
          const status   = prog?.status || 'not_started'
          const quizScore = prog?.quiz_score ?? null
          const isActive = currentModule === mod.id
          const statusLabel = status === 'completed' ? 'complete' : status === 'in_progress' ? 'in progress' : 'not started'

          return (
            <li key={mod.id} role="option" aria-selected={isActive}>
              <button onClick={() => handleSelect(mod)}
                aria-label={`Module ${mod.id}: ${mod.title}. ${statusLabel}. ${mod.estimatedMinutes} minutes.${quizScore !== null ? ` Quiz score: ${quizScore}.` : ''}`}
                style={{ width:'100%', textAlign:'left',
                  background: isActive
                    ? 'linear-gradient(135deg,rgba(168,85,247,0.14),rgba(236,72,153,0.08))'
                    : 'transparent',
                  border:'none',
                  borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                  padding:'11px 16px', cursor:'pointer',
                  display:'flex', alignItems:'flex-start', gap:10,
                  transition:'background 0.15s', minHeight:44 }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background='rgba(255,255,255,0.03)' }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background='transparent' }}>

                <span style={{ fontSize:'1.15rem', flexShrink:0, marginTop:2 }} aria-hidden="true">
                  {mod.icon}
                </span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:4 }}>
                    <span style={{ color: isActive ? 'var(--accent)' : 'var(--text)',
                      fontWeight: isActive ? 600 : 400, fontSize:'0.86rem' }}>
                      {mod.title}
                    </span>
                    <StatusIcon status={status} />
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:2 }}>
                    <span style={{ color:'var(--muted)', fontSize:'0.72rem' }}>~{mod.estimatedMinutes}m</span>
                    {/* Quiz score badge for completed modules */}
                    {quizScore !== null && status === 'completed' && (
                      <span style={{ background:'rgba(74,222,128,0.12)', border:'1px solid rgba(74,222,128,0.25)',
                        borderRadius:10, padding:'1px 7px', fontSize:'0.68rem', color:'#4ade80' }}>
                        {quizScore}/{5}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            </li>
          )
        })}
      </ul>

      {/* Hint footer */}
      <div style={{ padding:'10px 16px', borderTop:'1px solid var(--border)',
        color:'var(--muted)', fontSize:'0.72rem', lineHeight:1.7 }}>
        <p><kbd style={{ background:'var(--border)', padding:'1px 5px', borderRadius:3 }}>J</kbd>
           {' '}/{' '}
           <kbd style={{ background:'var(--border)', padding:'1px 5px', borderRadius:3 }}>F</kbd>
           {' '}sawaal poochho</p>
        <p><kbd style={{ background:'var(--border)', padding:'1px 5px', borderRadius:3 }}>H</kbd> shortcuts help</p>
      </div>
    </nav>
  )
}
