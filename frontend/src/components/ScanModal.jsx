import { useState, useEffect, useRef } from 'react'
import { FolderOpen, Loader2, CheckCircle2, AlertCircle, Copy, SkipForward } from 'lucide-react'
import FolderPicker from './FolderPicker'
import { scanStreamUrl } from '../api'

export default function ScanModal({ onClose, onDone }) {
  const [stage, setStage] = useState('pick') // pick | scanning | done
  const [dir, setDir] = useState('')
  const [progress, setProgress] = useState({ i: 0, total: 0 })
  const [current, setCurrent] = useState('')
  const [log, setLog] = useState([])
  const [stats, setStats] = useState({ added: 0, skipped: 0, duplicates: 0, errors: [] })
  const [error, setError] = useState('')
  const esRef = useRef(null)
  const logRef = useRef(null)

  useEffect(() => {
    return () => esRef.current?.close()
  }, [])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log])

  function handleSelect(path) {
    if (!path) return
    setDir(path)
    setStage('scanning')
    setError('')
    setLog([])
    setStats({ added: 0, skipped: 0, duplicates: 0, errors: [] })

    const es = new EventSource(scanStreamUrl(path))
    esRef.current = es

    es.onmessage = (e) => {
      const data = JSON.parse(e.data)

      if (data.type === 'error') {
        setError(data.message)
        setStage('done')
        es.close()
        return
      }

      if (data.type === 'start') {
        setProgress({ i: 0, total: data.total })
        return
      }

      if (data.type === 'progress') {
        setProgress({ i: data.i, total: data.total })
        setCurrent(data.file)
        setStats((s) => ({
          ...s,
          added: s.added + (data.status === 'added' ? 1 : 0),
          skipped: s.skipped + (data.status === 'skipped' ? 1 : 0),
          duplicates: s.duplicates + (data.status === 'duplicate' ? 1 : 0),
          errors: data.status === 'error'
            ? [...s.errors, { file: data.file, error: data.error }]
            : s.errors,
        }))
        setLog((l) => [
          ...l.slice(-200),
          { status: data.status, file: data.file, book: data.book, error: data.error },
        ])
        return
      }

      if (data.type === 'done') {
        setStage('done')
        setStats({
          added: data.added, skipped: data.skipped,
          duplicates: data.duplicates, errors: data.errors,
        })
        onDone?.()
        es.close()
      }
    }

    es.onerror = () => {
      setError('连接中断')
      setStage('done')
      es.close()
    }
  }

  const pct = progress.total ? (progress.i / progress.total) * 100 : 0

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      {stage === 'pick' ? (
        <FolderPicker onSelect={handleSelect} onClose={onClose} />
      ) : (
        <div
          className="rounded-xl p-6 w-full max-w-lg border shadow-2xl"
          style={{ background: 'var(--bg-panel)', borderColor: 'var(--border)' }}
        >
          <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
            <FolderOpen size={20} style={{ color: 'var(--accent)' }} />
            {stage === 'scanning' ? '扫描中...' : '扫描完成'}
          </h2>
          <p className="text-xs text-faint mb-4 font-mono truncate">{dir}</p>

          {error && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{error}</p>}

          {/* Progress bar */}
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-muted">
                {stage === 'scanning' ? '处理中' : '已完成'}: {progress.i} / {progress.total}
              </span>
              <span className="text-muted">{pct.toFixed(0)}%</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-hover)' }}>
              <div
                className="h-full transition-all"
                style={{
                  width: `${pct}%`,
                  background: stage === 'done' ? 'var(--success)' : 'var(--accent)',
                }}
              />
            </div>
          </div>

          {/* Current file */}
          {stage === 'scanning' && current && (
            <div className="flex items-center gap-2 text-xs text-muted mb-3">
              <Loader2 size={12} className="animate-spin" />
              <span className="truncate font-mono">{current}</span>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-4 gap-2 mb-3">
            <StatBox icon={<CheckCircle2 size={14} />} label="新增" value={stats.added} color="var(--success)" />
            <StatBox icon={<SkipForward size={14} />} label="跳过" value={stats.skipped} color="var(--text-muted)" />
            <StatBox icon={<Copy size={14} />} label="重复" value={stats.duplicates} color="var(--accent)" />
            <StatBox icon={<AlertCircle size={14} />} label="失败" value={stats.errors.length} color="var(--danger)" />
          </div>

          {/* Live log */}
          <div
            ref={logRef}
            className="rounded-lg border p-2 h-32 overflow-y-auto text-xs font-mono mb-4"
            style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
          >
            {log.map((l, idx) => (
              <div key={idx} className="flex items-center gap-2 py-0.5">
                <span style={{ color: STATUS_COLORS[l.status] }}>{STATUS_LABELS[l.status]}</span>
                <span className="truncate text-muted">{l.file}</span>
              </div>
            ))}
          </div>

          <button onClick={onClose} className="btn-primary w-full" disabled={stage === 'scanning'}>
            {stage === 'done' ? '完成' : '扫描中...'}
          </button>
        </div>
      )}
    </div>
  )
}

const STATUS_LABELS = { added: '+', skipped: '=', duplicate: '⧉', error: '!', }
const STATUS_COLORS = {
  added: 'var(--success)',
  skipped: 'var(--text-faint)',
  duplicate: 'var(--accent)',
  error: 'var(--danger)',
}

function StatBox({ icon, label, value, color }) {
  return (
    <div className="card rounded-lg p-2 border text-center">
      <div className="flex items-center justify-center mb-0.5" style={{ color }}>{icon}</div>
      <p className="text-lg font-bold" style={{ color }}>{value}</p>
      <p className="text-[10px] text-faint uppercase">{label}</p>
    </div>
  )
}
