import { useState } from 'react'
import { Star } from 'lucide-react'

/**
 * Star rating. `value` 0~5; if onChange provided, interactive.
 */
export default function StarRating({ value = 0, onChange, size = 16, showZero = false }) {
  const [hover, setHover] = useState(0)
  const display = hover || value
  const interactive = !!onChange

  if (!interactive && !value && !showZero) return null

  return (
    <div
      className="inline-flex items-center gap-0.5"
      onMouseLeave={() => setHover(0)}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= display
        return (
          <button
            key={n}
            type="button"
            disabled={!interactive}
            onClick={(e) => {
              e.stopPropagation()
              // click same star again → clear rating
              onChange?.(n === value ? 0 : n)
            }}
            onMouseEnter={() => interactive && setHover(n)}
            className={interactive ? 'cursor-pointer transition-transform hover:scale-110' : ''}
            style={{ background: 'transparent', padding: 0, lineHeight: 0 }}
            title={interactive ? `${n} 星` : undefined}
          >
            <Star
              size={size}
              fill={filled ? '#f59e0b' : 'none'}
              color={filled ? '#f59e0b' : 'var(--text-faint)'}
              strokeWidth={1.5}
            />
          </button>
        )
      })}
    </div>
  )
}
