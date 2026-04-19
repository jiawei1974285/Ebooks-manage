import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * Global keyboard shortcuts.
 *   /        → focus element with data-shortcut="search"
 *   gg / gc / gs / gt → nav
 *   ?        → show help (calls onHelp)
 *   Esc      → blur + onEsc()
 */
export function useShortcuts({ onHelp, onEsc } = {}) {
  const navigate = useNavigate()
  const gKeyTime = useRef(0)

  useEffect(() => {
    function isTyping(el) {
      if (!el) return false
      const tag = el.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
    }

    function handler(e) {
      const typing = isTyping(document.activeElement)

      if (e.key === 'Escape') {
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur()
        onEsc?.()
        return
      }

      if (typing) return

      if (e.key === '/') {
        const el = document.querySelector('[data-shortcut="search"]')
        if (el) { e.preventDefault(); el.focus(); el.select?.() }
        return
      }

      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault()
        onHelp?.()
        return
      }

      if (e.key === 'g') {
        gKeyTime.current = Date.now()
        return
      }

      // second key of "g X" combo, within 1s
      if (Date.now() - gKeyTime.current < 1000) {
        const map = { g: '/', c: '/chat', s: '/stats', t: '/settings', d: '/duplicates' }
        const dest = map[e.key]
        if (dest) { e.preventDefault(); navigate(dest); gKeyTime.current = 0 }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate, onHelp, onEsc])
}
