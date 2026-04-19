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
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      <style>{`
        .active-nav { background: var(--accent); color: white; }
        .nav-link { color: var(--text-muted); }
        .nav-link:hover { color: var(--text); background: var(--bg-hover); }
      `}</style>

      <header
        className="flex items-center gap-1 px-4 h-14 shrink-0 border-b"
        style={{ background: 'var(--bg-panel)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-2 mr-4 shrink-0">
          <h1 className="text-lg font-bold tracking-tight whitespace-nowrap" style={{ color: 'var(--accent)' }}>📚 书库</h1>
          <span className="text-xs whitespace-nowrap hidden md:inline" style={{ color: 'var(--text-faint)' }}>电子书管理系统</span>
        </div>

        <nav className="flex items-center gap-1 flex-1 overflow-x-auto">
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
        </nav>

        <div className="flex items-center gap-1 shrink-0">
          {unlocked && (
            <button onClick={handleLock} className={`nav-link ${navItem({ isActive: false })}`} title="锁定私密书架">
              <Lock size={16} />
            </button>
          )}
          <button onClick={handleExport} className={`nav-link ${navItem({ isActive: false })}`} title="导出备份">
            <Download size={16} />
          </button>
          <button onClick={() => setHelpOpen(true)} className={`nav-link ${navItem({ isActive: false })}`} title="快捷键">
            <Keyboard size={16} />
          </button>
          <NavLink to="/settings" className={(s) => `nav-link ${navItem(s)}`} title="设置">
            <Settings size={16} />
          </NavLink>
          <div className="pl-1">
            <ThemeSwitcher />
          </div>
        </div>
      </header>

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
