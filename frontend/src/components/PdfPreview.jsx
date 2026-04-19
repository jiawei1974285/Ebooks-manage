import { useState, useEffect, useRef } from 'react'
import { X, Bookmark } from 'lucide-react'
import { bookFileUrl, updateProgress } from '../api'

/**
 * In-browser PDF preview using the native browser PDF plugin via iframe.
 * Includes "save current page" input for reading progress tracking.
 */
export default function PdfPreview({ book, onClose, onProgressSaved }) {
  const [page, setPage] = useState(book.last_page || 1)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const iframeRef = useRef(null)

  async function savePage() {
    setSaving(true)
    try {
      await updateProgress(book.id, parseInt(page) || 0)
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
      onProgressSaved?.(parseInt(page) || 0)
    } finally {
      setSaving(false)
    }
  }

  // Point iframe to start page
  const src = `${bookFileUrl(book.id)}#page=${book.last_page || 1}&view=FitH`

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div
        className="rounded-xl border shadow-2xl flex flex-col w-full max-w-6xl h-[90vh]"
        style={{ background: 'var(--bg-panel)', borderColor: 'var(--border)' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{book.title}</p>
            <p className="text-xs text-faint truncate">{book.author}</p>
          </div>

          {/* Page bookmark */}
          <div className="flex items-center gap-2">
            <Bookmark size={14} className="text-muted" />
            <input
              type="number"
              min={1}
              max={book.page_count || undefined}
              value={page}
              onChange={(e) => setPage(e.target.value)}
              className="input-themed w-20 text-sm"
              placeholder="页码"
            />
            <span className="text-xs text-muted">/ {book.page_count || '?'}</span>
            <button onClick={savePage} disabled={saving} className="btn text-xs">
              {saved ? '✓' : '记录进度'}
            </button>
          </div>

          <button onClick={onClose} className="btn p-2">
            <X size={16} />
          </button>
        </div>

        {/* PDF viewer */}
        <iframe
          ref={iframeRef}
          src={src}
          className="flex-1 w-full rounded-b-xl"
          style={{ background: '#525659', border: 'none' }}
          title={book.title}
        />
      </div>
    </div>
  )
}
