import { createContext, useContext, useState, useCallback } from 'react'
import AiProgressToast from '../components/AiProgressToast'

const ProgressCtx = createContext(null)

export function ProgressProvider({ children }) {
  const [task, setTask] = useState(null)   // { url, onDone }

  const startBatch = useCallback((url, opts = {}) => {
    // Replacing an in-flight task: the previous EventSource is cleaned up
    // when <AiProgressToast> unmounts (useEffect cleanup closes the ES).
    setTask({ url, key: `${url}-${Date.now()}`, onDone: opts.onDone })
  }, [])

  const clear = useCallback(() => setTask(null), [])

  return (
    <ProgressCtx.Provider value={{ startBatch, clear, running: !!task }}>
      {children}
      {task && (
        <AiProgressToast
          key={task.key}
          url={task.url}
          onDone={(res) => { task.onDone?.(res) }}
          onClose={clear}
        />
      )}
    </ProgressCtx.Provider>
  )
}

export function useProgress() {
  const ctx = useContext(ProgressCtx)
  if (!ctx) throw new Error('useProgress must be used inside <ProgressProvider>')
  return ctx
}
