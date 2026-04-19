import { useState, useEffect } from 'react'
import { Folder, HardDrive, ChevronLeft, Home } from 'lucide-react'
import { browseDirectory } from '../api'

export default function FolderPicker({ onSelect, onClose }) {
  const [entries, setEntries] = useState([])
  const [currentPath, setCurrentPath] = useState('')
  const [parent, setParent] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [manualInput, setManualInput] = useState('')

  async function load(path = '') {
    setLoading(true)
    setError('')
    try {
      const { data } = await browseDirectory(path)
      setEntries(data.entries)
      setCurrentPath(data.path)
      setParent(data.parent)
    } catch (e) {
      setError(e.response?.data?.detail || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div
      className="rounded-xl p-5 w-full max-w-xl border shadow-2xl"
      style={{ background: 'var(--bg-panel)', borderColor: 'var(--border)' }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold">选择文件夹</h3>
        <button onClick={onClose} className="text-muted hover:opacity-70 text-sm">×</button>
      </div>

      {/* Current path + controls */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => parent !== null && load(parent)}
          disabled={parent === null}
          className="btn p-1.5 disabled:opacity-30"
          title="上一级"
        >
          <ChevronLeft size={14} />
        </button>
        <button onClick={() => load('')} className="btn p-1.5" title="回到驱动器列表">
          <Home size={14} />
        </button>
        <div
          className="flex-1 text-xs px-3 py-1.5 rounded-lg font-mono truncate"
          style={{ background: 'var(--bg-card)', color: 'var(--text-muted)' }}
        >
          {currentPath || '💾 驱动器列表'}
        </div>
      </div>

      {error && <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{error}</p>}

      {/* Entry list */}
      <div
        className="rounded-lg border overflow-y-auto mb-3"
        style={{ borderColor: 'var(--border)', height: '280px' }}
      >
        {loading ? (
          <p className="text-center text-sm text-muted py-8">加载中...</p>
        ) : entries.length === 0 ? (
          <p className="text-center text-sm text-faint py-8">此目录为空</p>
        ) : (
          entries.map((e) => (
            <button
              key={e.path}
              onClick={() => load(e.path)}
              className="w-full text-left px-4 py-2 text-sm flex items-center gap-2 border-b transition-colors hover:opacity-80"
              style={{ borderColor: 'var(--border)' }}
              onMouseEnter={(ev) => ev.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={(ev) => ev.currentTarget.style.background = ''}
            >
              {e.type === 'drive' ? <HardDrive size={14} /> : <Folder size={14} style={{ color: 'var(--accent)' }} />}
              <span>{e.name}</span>
            </button>
          ))
        )}
      </div>

      {/* Manual path input */}
      <input
        value={manualInput}
        onChange={(e) => setManualInput(e.target.value)}
        placeholder="或直接输入路径，例如 D:\电子书"
        className="input-themed w-full mb-3"
      />

      <div className="flex gap-2">
        <button
          onClick={() => onSelect(manualInput.trim() || currentPath)}
          disabled={!manualInput.trim() && !currentPath}
          className="btn-primary flex-1"
        >
          使用此目录
        </button>
        <button onClick={onClose} className="btn">取消</button>
      </div>
    </div>
  )
}
