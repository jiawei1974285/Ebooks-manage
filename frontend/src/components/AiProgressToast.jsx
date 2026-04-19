import { useEffect, useState, useRef } from 'react'
import { Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react'

const ACTION_LABELS = {
  summary: '生成摘要',
  classify: '自动分类',
  embed: '向量化',
  index: '全文索引',
  auto_tag: 'AI 打标签',
}

/**
 * Connects to a SSE URL, renders a floating progress toast.
 * Props:
 *   url: string                         — SSE endpoint
 *   onDone: ({ok, failed, total}) => void
 *   onClose: () => void
 */
export default function AiProgressToast({ url, onDone, onClose }) {
  const [state, setState] = useState({
    action: '', total: 0, i: 0, ok: 0, failed: 0,
    currentTitle: '', done: false, error: '',
    errors: [],
  })
  const esRef = useRef(null)

  useEffect(() => {
    if (!url) return
    const es = new EventSource(url)
    esRef.current = es
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data)
        setState(prev => {
          const next = { ...prev }
          if (msg.type === 'start') {
            next.action = msg.action; next.total = msg.total
          } else if (msg.type === 'begin') {
            next.i = msg.i; next.currentTitle = msg.title || ''
          } else if (msg.type === 'progress') {
            if (msg.status === 'ok') next.ok = (prev.ok || 0) + 1
            else {
              next.failed = (prev.failed || 0) + 1
              next.errors = [...prev.errors, { title: msg.title, error: msg.error }].slice(-5)
            }
          } else if (msg.type === 'done') {
            next.done = true; next.ok = msg.ok; next.failed = msg.failed; next.total = msg.total
            try { es.close() } catch {}
            onDone?.({ ok: msg.ok, failed: msg.failed, total: msg.total, action: msg.action })
          }
          return next
        })
      } catch {}
    }
    es.onerror = () => {
      setState(prev => ({ ...prev, done: true, error: '连接中断' }))
      try { es.close() } catch {}
    }
    return () => { try { es.close() } catch {} }
  }, [url])

  function handleClose() {
    try { esRef.current?.close() } catch {}
    onClose?.()
  }

  const label = ACTION_LABELS[state.action] || state.action || '处理中'
  const pct = state.total ? Math.min(100, Math.round((state.i / state.total) * 100)) : 0

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 rounded-xl border shadow-2xl"
         style={{ background: 'var(--bg-panel)', borderColor: 'var(--border)' }}>
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          {state.done ? (
            state.failed > 0 || state.error
              ? <AlertCircle size={16} style={{ color: '#f59e0b' }} />
              : <CheckCircle2 size={16} style={{ color: '#10b981' }} />
          ) : (
            <Loader2 size={16} className="animate-spin" style={{ color: 'var(--accent)' }} />
          )}
          <span className="text-sm font-semibold flex-1">{label}</span>
          <button onClick={handleClose} className="text-faint hover:text-default">
            <X size={14} />
          </button>
        </div>

        <div className="h-1.5 rounded-full overflow-hidden mb-2" style={{ background: 'var(--bg-hover)' }}>
          <div className="h-full transition-all"
               style={{ width: `${pct}%`, background: state.done && state.failed === 0 ? '#10b981' : 'var(--accent)' }} />
        </div>

        <div className="text-xs text-muted flex items-center justify-between">
          <span>{state.i} / {state.total}</span>
          <span>
            {state.ok > 0 && <span style={{ color: '#10b981' }}>✓ {state.ok}</span>}
            {state.failed > 0 && <span className="ml-2" style={{ color: '#f59e0b' }}>✗ {state.failed}</span>}
          </span>
        </div>

        {!state.done && state.currentTitle && (
          <p className="mt-2 text-xs text-faint truncate" title={state.currentTitle}>
            当前：{state.currentTitle}
          </p>
        )}

        {state.done && (
          <p className="mt-2 text-xs text-muted">
            {state.error
              ? `中断：${state.error}`
              : state.failed > 0
                ? `完成：成功 ${state.ok}，失败 ${state.failed}`
                : `完成：共处理 ${state.ok} 本`}
          </p>
        )}

        {state.errors.length > 0 && (
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-faint">失败详情 ({state.errors.length})</summary>
            <ul className="mt-1 space-y-0.5 max-h-32 overflow-y-auto">
              {state.errors.map((e, i) => (
                <li key={i} className="text-faint truncate" title={e.error}>
                  《{e.title}》— {e.error}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  )
}
