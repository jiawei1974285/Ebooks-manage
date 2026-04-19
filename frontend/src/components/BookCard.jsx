import { useNavigate } from 'react-router-dom'
import { FileText, Check, BookMarked, ScanLine } from 'lucide-react'
import { useState } from 'react'
import StarRating from './StarRating'

export default function BookCard({ book, siblings = [], selectable, selected, onToggleSelect, view = 'grid' }) {
  const navigate = useNavigate()
  const [imgLoaded, setImgLoaded] = useState(false)
  const [imgError, setImgError] = useState(false)

  // All formats available for this logical book (primary + siblings), deduplicated
  const allFormats = (() => {
    const seen = new Map()
    for (const b of [book, ...siblings]) {
      const f = (b.file_format || '').toUpperCase()
      if (f && !seen.has(f)) seen.set(f, b.id)
    }
    return [...seen.entries()].map(([fmt, id]) => ({ fmt, id }))
  })()
  const hasSiblings = siblings.length > 0

  function handleClick(e) {
    if (selectable && (e.ctrlKey || e.metaKey || e.shiftKey)) {
      e.preventDefault()
      onToggleSelect?.(book.id, e)
      return
    }
    if (selectable && selected) {
      onToggleSelect?.(book.id, e)
      return
    }
    navigate(`/books/${book.id}`)
  }

  if (view === 'list') return <BookRow book={book} siblings={siblings} allFormats={allFormats}
    selectable={selectable} selected={selected}
    onToggleSelect={onToggleSelect} onOpen={handleClick} />

  return (
    <div
      onClick={handleClick}
      className="card rounded-xl overflow-hidden cursor-pointer hover:scale-[1.03] transition-all duration-200 border relative"
      style={{ borderColor: selected ? 'var(--accent)' : undefined, borderWidth: selected ? 2 : 1 }}
      onMouseEnter={(e) => { if (!selected) e.currentTarget.style.borderColor = 'var(--accent)' }}
      onMouseLeave={(e) => { if (!selected) e.currentTarget.style.borderColor = 'var(--border)' }}
    >
      {selectable && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSelect?.(book.id, e) }}
          className="absolute top-2 left-2 z-10 w-5 h-5 rounded flex items-center justify-center transition-colors"
          style={{
            background: selected ? 'var(--accent)' : 'rgba(0,0,0,0.4)',
            border: '1px solid white',
          }}
        >
          {selected && <Check size={12} color="white" />}
        </button>
      )}

      <div
        className="aspect-[3/4] flex items-center justify-center overflow-hidden relative"
        style={{ background: 'var(--bg-hover)' }}
      >
        {book.cover_url && !imgError ? (
          <>
            {!imgLoaded && (
              <div
                className="absolute inset-0 animate-pulse"
                style={{
                  background: 'linear-gradient(90deg, var(--bg-hover), var(--border), var(--bg-hover))',
                  backgroundSize: '200% 100%',
                }}
              />
            )}
            <img
              src={book.cover_url}
              alt={book.title}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover transition-opacity duration-300"
              style={{ opacity: imgLoaded ? 1 : 0 }}
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
            />
          </>
        ) : (
          <div
            className="w-full h-full flex flex-col items-center justify-center gap-2"
            style={{ color: 'var(--text-faint)' }}
          >
            <FileText size={40} />
            <span className="text-xs font-medium uppercase tracking-wider">{book.file_format}</span>
          </div>
        )}
      </div>

      <div className="p-3">
        <h3 className="font-semibold text-sm leading-snug line-clamp-2">{book.title}</h3>
        <p className="text-xs text-muted mt-1 truncate">{book.author || '未知作者'}</p>
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {hasSiblings ? (
            <span className="inline-flex items-center gap-0.5" title={`共 ${allFormats.length} 种格式`}>
              {allFormats.map(({ fmt, id }) => (
                <button
                  key={fmt}
                  onClick={(e) => { e.stopPropagation(); navigate(`/books/${id}`) }}
                  className="chip-gray uppercase text-[10px] px-1.5"
                  style={fmt === book.file_format
                    ? { background: 'var(--accent-soft)', color: 'var(--accent)' }
                    : undefined}
                  title={`打开 ${fmt} 版本`}
                >
                  {fmt}
                </button>
              ))}
            </span>
          ) : (
            <span className="chip-gray uppercase">{book.file_format}</span>
          )}
          {book.categories?.[0] && <span className="chip truncate">{book.categories[0]}</span>}
          {book.indexed && <span className="chip-gray" title="已建立全文索引">📖</span>}
          {book.mineru_parsed && (
            <span className="chip-gray inline-flex items-center gap-0.5" title="已用 MinerU 解析">
              <ScanLine size={10} /> OCR
            </span>
          )}
        </div>
        {book.rating > 0 && (
          <div className="mt-1.5"><StarRating value={book.rating} size={12} /></div>
        )}
        {book.reading_progress > 0 && (
          <div className="mt-2">
            <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--bg-hover)' }}>
              <div
                className="h-full"
                style={{ width: `${Math.min(book.reading_progress, 100)}%`, background: 'var(--accent)' }}
              />
            </div>
            <p className="text-[10px] text-faint mt-0.5">已读 {book.reading_progress}%</p>
          </div>
        )}
      </div>
    </div>
  )
}

function BookRow({ book, siblings = [], allFormats, selectable, selected, onToggleSelect, onOpen }) {
  const navigate = useNavigate()
  const [imgError, setImgError] = useState(false)
  const hasSiblings = siblings.length > 0
  return (
    <div
      onClick={onOpen}
      className="flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors"
      style={{
        background: selected ? 'var(--accent-soft)' : 'var(--bg-card)',
        borderColor: selected ? 'var(--accent)' : 'var(--border)',
      }}
      onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = 'var(--bg-hover)' }}
      onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = 'var(--bg-card)' }}
    >
      {selectable && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSelect?.(book.id, e) }}
          className="w-4 h-4 rounded border flex items-center justify-center shrink-0"
          style={{
            background: selected ? 'var(--accent)' : 'transparent',
            borderColor: selected ? 'var(--accent)' : 'var(--border)',
          }}
        >
          {selected && <Check size={10} color="white" />}
        </button>
      )}
      <div className="w-10 h-14 rounded overflow-hidden shrink-0" style={{ background: 'var(--bg-hover)' }}>
        {book.cover_url && !imgError
          ? <img src={book.cover_url} alt="" loading="lazy" className="w-full h-full object-cover"
              onError={() => setImgError(true)} />
          : <div className="w-full h-full flex items-center justify-center text-faint text-[9px] font-bold">{book.file_format}</div>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate">{book.title}</p>
          {book.indexed && <BookMarked size={11} className="shrink-0" style={{ color: 'var(--accent)' }} />}
          {book.mineru_parsed && <ScanLine size={11} className="shrink-0" style={{ color: 'var(--accent)' }} title="MinerU 已解析" />}
        </div>
        <p className="text-xs text-faint truncate">{book.author || '未知作者'}</p>
      </div>
      <div className="hidden md:block text-xs text-muted w-24 truncate">
        {book.categories?.[0] || '—'}
      </div>
      <div className="hidden lg:block text-xs text-muted w-16 text-right">
        {book.page_count ? `${book.page_count} 页` : '—'}
      </div>
      <div className="w-24"><StarRating value={book.rating} size={12} showZero /></div>
      {hasSiblings && allFormats ? (
        <span className="inline-flex items-center gap-0.5 shrink-0">
          {allFormats.map(({ fmt, id }) => (
            <button
              key={fmt}
              onClick={(e) => { e.stopPropagation(); navigate(`/books/${id}`) }}
              className="chip-gray uppercase text-[10px] px-1.5"
              style={fmt === book.file_format
                ? { background: 'var(--accent-soft)', color: 'var(--accent)' }
                : undefined}
              title={`打开 ${fmt} 版本`}
            >
              {fmt}
            </button>
          ))}
        </span>
      ) : (
        <span className="chip-gray uppercase text-[10px] shrink-0">{book.file_format}</span>
      )}
      {book.reading_progress > 0 && (
        <div className="w-20 hidden md:block">
          <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--bg-hover)' }}>
            <div className="h-full" style={{ width: `${Math.min(book.reading_progress, 100)}%`, background: 'var(--accent)' }} />
          </div>
          <p className="text-[9px] text-faint mt-0.5 text-right">{book.reading_progress}%</p>
        </div>
      )}
    </div>
  )
}

export function BookCardSkeleton() {
  return (
    <div className="card rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
      <div
        className="aspect-[3/4] animate-pulse"
        style={{ background: 'var(--bg-hover)' }}
      />
      <div className="p-3 space-y-2">
        <div className="h-4 rounded animate-pulse" style={{ background: 'var(--bg-hover)' }} />
        <div className="h-3 w-2/3 rounded animate-pulse" style={{ background: 'var(--bg-hover)' }} />
        <div className="h-3 w-1/3 rounded animate-pulse" style={{ background: 'var(--bg-hover)' }} />
      </div>
    </div>
  )
}
