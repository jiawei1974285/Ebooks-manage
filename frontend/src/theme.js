// Theme definitions — CSS variables injected into :root
export const THEMES = {
  dark: {
    name: '深色',
    emoji: '🌙',
    vars: {
      '--bg':        '#030712',
      '--bg-panel':  '#111827',
      '--bg-card':   '#1f2937',
      '--bg-hover':  '#374151',
      '--border':    '#374151',
      '--border-strong': '#4b5563',
      '--text':      '#f3f4f6',
      '--text-muted':'#9ca3af',
      '--text-faint':'#6b7280',
      '--accent':    '#3b82f6',
      '--accent-hover': '#2563eb',
      '--accent-soft': '#1e3a8a80',
      '--accent-text': '#93c5fd',
      '--danger':    '#ef4444',
      '--success':   '#10b981',
    },
  },
  light: {
    name: '浅色',
    emoji: '☀️',
    vars: {
      '--bg':        '#f9fafb',
      '--bg-panel':  '#ffffff',
      '--bg-card':   '#ffffff',
      '--bg-hover':  '#f3f4f6',
      '--border':    '#e5e7eb',
      '--border-strong': '#d1d5db',
      '--text':      '#111827',
      '--text-muted':'#4b5563',
      '--text-faint':'#9ca3af',
      '--accent':    '#2563eb',
      '--accent-hover': '#1d4ed8',
      '--accent-soft': '#dbeafe',
      '--accent-text': '#1e40af',
      '--danger':    '#dc2626',
      '--success':   '#059669',
    },
  },
  sepia: {
    name: '护眼',
    emoji: '📖',
    vars: {
      '--bg':        '#f4ecd8',
      '--bg-panel':  '#ede1c4',
      '--bg-card':   '#faf3e0',
      '--bg-hover':  '#e6d8b8',
      '--border':    '#d6c7a3',
      '--border-strong': '#b8a67c',
      '--text':      '#3d2f1f',
      '--text-muted':'#6b5640',
      '--text-faint':'#97856b',
      '--accent':    '#a0522d',
      '--accent-hover': '#8b4513',
      '--accent-soft': '#e8d5b7',
      '--accent-text': '#6b3410',
      '--danger':    '#a94442',
      '--success':   '#5a7d2a',
    },
  },
}

export function applyTheme(themeName) {
  const theme = THEMES[themeName] || THEMES.dark
  const root = document.documentElement
  Object.entries(theme.vars).forEach(([k, v]) => root.style.setProperty(k, v))
  root.dataset.theme = themeName
  localStorage.setItem('theme', themeName)
}

export function getInitialTheme() {
  return localStorage.getItem('theme') || 'dark'
}
