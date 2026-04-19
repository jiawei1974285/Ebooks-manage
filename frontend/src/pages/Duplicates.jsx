import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Copy, Trash2, RefreshCw, Loader2, Search, Wand2, CheckSquare, Square } from 'lucide-react'
import { getDuplicates, deleteBook, rescanDuplicates } from '../api'

// Heuristic: prefer newest created_at; tie-break by largest file_size (full versions usually bigger).
function pickKeeper(books) {
  return [...books].sort((a, b) => {
    const ta = new Date(a.created_at || 0).getTime()
    const tb = new Date(b.created_at || 0).getTime()
    if (ta !== tb) return tb - ta  // newer first
    return (b.file_size || 0) - (a.file_size || 0)
  })[0]
}

export default function Duplicates() {
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [deleting, setDeleting] = useState(false)
  const navigate = useNavigate()

  async function load() {
    setLoading(true)
    try {
      const { data } = await getDuplicates()
      setGroups(data.groups)
      setSelected(new Set())
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function handleScan() {
    setScanning(true); setScanResult(null)
    try {
      const { data } = await rescanDuplicates()
      setScanResult(data)
      setGroups(data.groups)
      setSelected(new Set())
    } catch (e) {
      setScanResult({ error: e.response?.data?.detail || e.message })
    } finally { setScanning(false) }
  }

  function toggle(id) {
    setSelected(s => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  // Auto-select all duplicates except the keeper of each group
  function autoSelect() {
    const ids = new Set()
    for (const g of groups) {
      const keeper = pickKeeper(g.books)
      for (const b of g.books) {
        if (b.id !== keeper.id) ids.add(b.id)
      }
    }
    setSelected(ids)
  }

  function clearSelection() { setSelected(new Set()) }

  async function bulkDelete() {
    if (selected.size === 0) return
    if (!confirm(`确认从书库移除 ${selected.size} 本重复书？（不会删除磁盘文件）`)) return
    setDeleting(true)
    try {
      for (const id of selected) {
        try { await deleteBook(id) } catch (e) { console.error('delete failed', id, e) }
      }
      await load()
    } finally { setDeleting(false) }
  }

  async function removeOne(id) {
    if (!confirm('从书库移除（不会删除磁盘文件）？')) return
    await deleteBook(id); load()
  }

  const keepers = useMemo(() => {
    const m = new Map()
    for (const g of groups) m.set(g.hash, pickKeeper(g.books).id)
    return m
  }, [groups])

  const toDeleteCount = useMemo(() => {
    let n = 0
    for (const g of groups) n += Math.max(0, g.books.length - 1)
    return n
  }, [groups])

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-start justify-between mb-2 flex-wrap gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Copy size={22} /> 重复书籍
        </h1>
        <div className="flex gap-2 flex-wrap">
          <button onClick={load} disabled={loading} className="btn flex items-center gap-1.5 text-sm">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> 刷新
          </button>
          <button onClick={handleScan} disabled={scanning} className="btn-primary flex items-center gap-1.5 text-sm">
            {scanning ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {scanning ? '扫描中...' : '扫描重复文件'}
          </button>
        </div>
      </div>
      <p className="text-sm text-muted mb-6">
        基于文件哈希检测重复。自动选择会保留每组<b>最新添加</b>（文件更大者优先）的一份，其余建议移除。
      </p>

      {scanResult && (
        <div className="mb-4 rounded-lg px-4 py-2 text-sm"
          style={{
            background: scanResult.error ? '#fca5a540' : 'var(--accent-soft)',
            color: scanResult.error ? 'var(--danger)' : 'var(--accent-text)',
          }}>
          {scanResult.error
            ? <span>扫描失败：{scanResult.error}</span>
            : <span>扫描完成：补算 {scanResult.updated} 个哈希{scanResult.missing_files > 0 && `（${scanResult.missing_files} 个文件已丢失）`}，共发现 <b>{scanResult.duplicate_groups}</b> 组重复</span>}
        </div>
      )}

      {/* Batch toolbar */}
      {groups.length > 0 && (
        <div
          className="sticky top-0 z-10 mb-4 rounded-lg border px-4 py-3 flex items-center gap-2 flex-wrap"
          style={{ background: 'var(--bg-panel)', borderColor: 'var(--border)' }}
        >
          <button onClick={autoSelect} className="btn flex items-center gap-1.5 text-sm">
            <Wand2 size={14} /> 自动选择（保留最新，共 {toDeleteCount} 本）
          </button>
          {selected.size > 0 && (
            <button onClick={clearSelection} className="btn text-sm">取消选择</button>
          )}
          <div className="flex-1" />
          <span className="text-sm text-muted">已选 {selected.size}</span>
          <button
            onClick={bulkDelete}
            disabled={selected.size === 0 || deleting}
            className="flex items-center gap-1.5 text-sm rounded-lg px-3 py-1.5 border disabled:opacity-40 transition-colors"
            style={{ color: 'white', background: 'var(--danger)', borderColor: 'var(--danger)' }}
          >
            {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            一键删除选中
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-muted">加载中...</div>
      ) : groups.length === 0 ? (
        <div className="text-center py-16 text-muted">
          <p className="text-lg">没有发现重复书籍</p>
          <p className="text-sm text-faint mt-2">书库很干净 ✨</p>
          <p className="text-xs text-faint mt-4">若老记录没有哈希，点击上方「扫描重复文件」试试</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => {
            const keeperId = keepers.get(g.hash)
            return (
              <div key={g.hash} className="card rounded-xl border p-4">
                <p className="text-xs text-faint font-mono mb-3">hash: {g.hash.slice(0, 16)}... · {g.books.length} 本</p>
                <div className="space-y-2">
                  {g.books.map((b) => {
                    const isKeeper = b.id === keeperId
                    const isSelected = selected.has(b.id)
                    return (
                      <div key={b.id}
                        onClick={() => !isKeeper && toggle(b.id)}
                        className="flex items-center gap-3 p-2 rounded-lg border transition-colors"
                        style={{
                          borderColor: isSelected ? 'var(--danger)' : (isKeeper ? 'var(--accent)' : 'var(--border)'),
                          background: isSelected ? '#fca5a520' : (isKeeper ? 'var(--accent-soft)' : 'transparent'),
                          cursor: isKeeper ? 'default' : 'pointer',
                        }}
                      >
                        <button
                          onClick={(e) => { e.stopPropagation(); !isKeeper && toggle(b.id) }}
                          disabled={isKeeper}
                          className="shrink-0"
                          title={isKeeper ? '保留（最新）' : '勾选后一键删除'}
                        >
                          {isKeeper
                            ? <span className="text-xs font-semibold px-1.5 py-0.5 rounded" style={{ background: 'var(--accent)', color: 'white' }}>保留</span>
                            : isSelected ? <CheckSquare size={18} style={{ color: 'var(--danger)' }} /> : <Square size={18} className="text-faint" />}
                        </button>
                        <div className="w-10 h-14 rounded overflow-hidden shrink-0" style={{ background: 'var(--bg-hover)' }}>
                          {b.cover_url
                            ? <img src={b.cover_url} className="w-full h-full object-cover" loading="lazy" />
                            : <div className="w-full h-full flex items-center justify-center text-faint text-[9px] font-bold">{b.file_format}</div>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{b.title}</p>
                          <p className="text-xs text-faint font-mono truncate">{b.file_path}</p>
                          <p className="text-[10px] text-faint mt-0.5">
                            {(b.file_size / 1024 / 1024).toFixed(1)} MB · 添加于 {b.created_at?.slice(0, 10)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => navigate(`/books/${b.id}`)} className="btn text-xs">查看</button>
                          <button onClick={() => removeOne(b.id)} className="btn text-xs" style={{ color: 'var(--danger)' }}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
