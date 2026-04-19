import { X } from 'lucide-react'

const SHORTCUTS = [
  { k: '/', d: '聚焦搜索框' },
  { k: 'g g', d: '返回书架' },
  { k: 'g c', d: '前往 AI 问书' },
  { k: 'g s', d: '前往统计' },
  { k: 'g t', d: '前往设置' },
  { k: 'Esc', d: '清除搜索 / 取消选择 / 关闭弹窗' },
  { k: 'Ctrl + A', d: '全选当前页（书架）' },
  { k: 'Ctrl + 点击', d: '多选切换' },
  { k: 'Shift + 点击', d: '范围多选' },
  { k: '?', d: '显示此帮助' },
]

export default function ShortcutsHelp({ open, onClose }) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="rounded-xl max-w-md w-full p-6 card border"
        style={{ borderColor: 'var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">键盘快捷键</h2>
          <button onClick={onClose} className="text-faint hover:opacity-70"><X size={18} /></button>
        </div>
        <div className="space-y-2">
          {SHORTCUTS.map((s) => (
            <div key={s.k} className="flex items-center justify-between text-sm py-1">
              <span className="text-muted">{s.d}</span>
              <kbd
                className="px-2 py-0.5 rounded text-xs font-mono border"
                style={{ background: 'var(--bg-hover)', borderColor: 'var(--border)' }}
              >
                {s.k}
              </kbd>
            </div>
          ))}
        </div>
        <p className="text-xs text-faint mt-4">按 Esc 关闭</p>
      </div>
    </div>
  )
}
