import { useState, useEffect } from 'react'
import { THEMES, applyTheme, getInitialTheme } from '../theme'

export default function ThemeSwitcher() {
  const [theme, setTheme] = useState(getInitialTheme())

  useEffect(() => { applyTheme(theme) }, [theme])

  return (
    <div
      className="flex gap-1 p-1 rounded-lg"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      {Object.entries(THEMES).map(([key, t]) => (
        <button
          key={key}
          onClick={() => setTheme(key)}
          title={t.name}
          className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${
            theme === key ? 'ring-2' : 'opacity-60 hover:opacity-100'
          }`}
          style={{
            background: theme === key ? 'var(--accent)' : 'transparent',
            color: theme === key ? 'white' : 'var(--text-muted)',
            '--tw-ring-color': 'var(--accent)',
          }}
        >
          {t.emoji}
        </button>
      ))}
    </div>
  )
}
