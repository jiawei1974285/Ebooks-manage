import { useState, useRef } from 'react'
import { Upload, Loader2, X, CheckCircle2 } from 'lucide-react'
import { uploadFiles } from '../api'

/**
 * Full-page drag overlay + dropzone for uploading PDF/EPUB files.
 * Renders children normally; shows overlay when dragging files.
 */
export default function DropZone({ children, onDone }) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)
  const dragCounter = useRef(0)

  function onDragEnter(e) {
    e.preventDefault()
    if (e.dataTransfer.types?.includes('Files')) {
      dragCounter.current++
      setDragging(true)
    }
  }
  function onDragLeave(e) {
    e.preventDefault()
    dragCounter.current--
    if (dragCounter.current === 0) setDragging(false)
  }
  function onDragOver(e) { e.preventDefault() }

  async function onDrop(e) {
    e.preventDefault()
    dragCounter.current = 0
    setDragging(false)

    const items = [...(e.dataTransfer.files || [])]
    const valid = items.filter(f => /\.(pdf|epub)$/i.test(f.name))
    if (valid.length === 0) return

    setUploading(true)
    try {
      const { data } = await uploadFiles(valid)
      setResult(data)
      onDone?.()
    } catch (err) {
      setResult({ error: err.response?.data?.detail || '上传失败' })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="h-full"
    >
      {children}

      {/* Drag overlay */}
      {dragging && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          style={{ background: 'var(--bg)88', backdropFilter: 'blur(4px)' }}
        >
          <div
            className="border-4 border-dashed rounded-3xl p-16 text-center"
            style={{ borderColor: 'var(--accent)', background: 'var(--accent-soft)' }}
          >
            <Upload size={64} className="mx-auto mb-4" style={{ color: 'var(--accent)' }} />
            <p className="text-xl font-semibold" style={{ color: 'var(--accent-text)' }}>松开以导入电子书</p>
            <p className="text-sm mt-2" style={{ color: 'var(--accent-text)' }}>支持 PDF / EPUB</p>
          </div>
        </div>
      )}

      {/* Uploading overlay */}
      {uploading && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="card border rounded-xl p-6 flex items-center gap-3">
            <Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent)' }} />
            <span>正在上传并解析...</span>
          </div>
        </div>
      )}

      {/* Result toast */}
      {result && !uploading && (
        <div
          className="fixed bottom-6 right-6 z-50 rounded-xl border shadow-xl p-4 flex items-start gap-3 max-w-sm"
          style={{ background: 'var(--bg-panel)', borderColor: 'var(--border)' }}
        >
          <CheckCircle2 size={18} style={{ color: 'var(--success)' }} className="mt-0.5" />
          <div className="flex-1 text-sm">
            {result.error
              ? <span style={{ color: 'var(--danger)' }}>{result.error}</span>
              : <span>已导入 <b>{result.added}</b> 本{result.duplicates ? ` · 重复 ${result.duplicates}` : ''}{result.errors?.length ? ` · 失败 ${result.errors.length}` : ''}</span>}
          </div>
          <button onClick={() => setResult(null)} className="text-faint hover:opacity-60"><X size={14} /></button>
        </div>
      )}
    </div>
  )
}
