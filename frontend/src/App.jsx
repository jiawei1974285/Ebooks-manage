import { BrowserRouter, NavLink, Routes, Route, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { BookOpen, GitFork, MessageSquare, Settings, BarChart3, Copy, Keyboard, Download, Lock, Unlock } from 'lucide-react'
import PrivateGate from './components/PrivateGate'
import { privateLock, privateStatus } from './api'
import Library from './pages/Library'
import BookDetail from './pages/BookDetail'
import Graph from './pages/Graph'
import Chat from './pages/Chat'
import SettingsPage from './pages/Settings'
import Stats from './pages/Stats'
import Duplicates from './pages/Duplicates'
import ThemeSwitcher from './components/ThemeSwitcher'
import ShortcutsHelp from './components/ShortcutsHelp'
import { useShortcuts } from './hooks/useShortcuts'
import { exportLibrary } from './api'
import { ProgressProvider } from './contexts/ProgressContext'

const navItem = ({ isActive }) =>
  `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
    isActive ? 'active-nav' : 'hover:opacity-80'
  }`

function Shell() {
  const [helpOpen, setHelpOpen] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  useShortcuts({ onHelp: () => setHelpOpen(true), onEsc: () => setHelpOpen(false) })

  useEffect(() => {
    const check = () => privateStatus().then(({ data }) => setUnlocked(data.unlocked)).catch(() => {})
    check()
    const iv = setInterval(check, 15000)
    return () => clearInterval(iv)
  }, [])

  async function handleLock() {
    await privateLock().catch(() => {})
    localStorage.removeItem('privateToken')
    setUnlocked(false)
    if (window.location.pathname.startsWith('/private')) window.location.href = '/'
  }

  async function handleExport() {
    const { data } = await exportLibrary()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `library-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      <style>{`
        .active-nav { background: var(--accent); color: white; }
        .nav-link { color: var(--text-muted); }
        .nav-link:hover { color: var(--text); background: var(--bg-hover); }
      `}</style>

      <aside
        className="w-52 flex flex-col py-6 px-3 gap-1 shrink-0 border-r"
        style={{ background: 'var(--bg-panel)', borderColor: 'var(--border)' }}
      >
        <div className="px-3 mb-6">
          <h1 className="text-lg font-bold tracking-tight" style={{ color: 'var(--accent)' }}>📚 书库</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>电子书管理系统</p>
        </div>

        <NavLink to="/" className={(s) => `nav-link ${navItem(s)}`} end>
          <BookOpen size={16} /> 书架
        </NavLink>
        <NavLink to="/stats" className={(s) => `nav-link ${navItem(s)}`}>
          <BarChart3 size={16} /> 统计
        </NavLink>
        <NavLink to="/graph" className={(s) => `nav-link ${navItem(s)}`}>
          <GitFork size={16} /> 知识图谱
        </NavLink>
        <NavLink to="/chat" className={(s) => `nav-link ${navItem(s)}`}>
          <MessageSquare size={16} /> AI 问书
        </NavLink>
        <NavLink to="/duplicates" className={(s) => `nav-link ${navItem(s)}`}>
          <Copy size={16} /> 重复管理
        </NavLink>
        <NavLink to="/private" className={(s) => `nav-link ${navItem(s)}`}>
          {unlocked ? <Unlock size={16} /> : <Lock size={16} />} 私密书架
        </NavLink>

        <div className="flex-1" />

        {unlocked && (
          <button onClick={handleLock} className={`nav-link ${navItem({ isActive: false })}`}>
            <Lock size={16} /> 锁定私密书架
          </button>
        )}

        <button onClick={handleExport} className={`nav-link ${navItem({ isActive: false })}`}>
          <Download size={16} /> 导出备份
        </button>
        <button onClick={() => setHelpOpen(true)} className={`nav-link ${navItem({ isActive: false })}`}>
          <Keyboard size={16} /> 快捷键
        </button>
        <NavLink to="/settings" className={(s) => `nav-link ${navItem(s)}`}>
          <Settings size={16} /> 设置
        </NavLink>
        <div className="px-2 pt-2">
          <ThemeSwitcher />
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/" element={<Library />} />
          <Route path="/books/:id" element={<BookDetail />} />
          <Route path="/graph" element={<Graph />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/duplicates" element={<Duplicates />} />
          <Route path="/private" element={<PrivateGate><Library scope="private" /></PrivateGate>} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>

      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ProgressProvider>
        <Shell />
      </ProgressProvider>
    </BrowserRouter>
  )
}
