import { useEffect, useState } from 'react'
import { Lock, KeyRound, Eye, EyeOff } from 'lucide-react'
import { privateStatus, privateUnlock, privateSetPassword } from '../api'

/**
 * Gate private content behind a password. Renders children only when unlocked.
 */
export default function PrivateGate({ children }) {
  const [status, setStatus] = useState(null) // { has_password, unlocked }
  const [loading, setLoading] = useState(true)

  useEffect(() => { refresh() }, [])

  async function refresh() {
    setLoading(true)
    try {
      const { data } = await privateStatus()
      setStatus(data)
    } finally { setLoading(false) }
  }

  function onUnlocked(token) {
    localStorage.setItem('privateToken', token)
    refresh()
  }

  if (loading) return <div className="flex items-center justify-center h-full text-muted">加载中...</div>

  if (!status?.has_password) {
    return <SetPasswordForm onDone={refresh} />
  }
  if (!status.unlocked) {
    return <UnlockForm onUnlocked={onUnlocked} />
  }
  return children
}

function SetPasswordForm({ onDone }) {
  const [pwd, setPwd] = useState('')
  const [pwd2, setPwd2] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [show, setShow] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setErr('')
    if (pwd.length < 4) return setErr('密码至少 4 位')
    if (pwd !== pwd2) return setErr('两次密码不一致')
    setBusy(true)
    try {
      await privateSetPassword(pwd)
      onDone()
    } catch (e) {
      setErr(e.response?.data?.detail || '设置失败')
    } finally { setBusy(false) }
  }

  return (
    <Wrapper icon={<KeyRound size={40} />} title="设置私密书架密码"
      desc="首次使用私密书架，请先设置访问密码。此后查看私密书籍都需要输入此密码。">
      <form onSubmit={submit} className="space-y-3">
        <PwdInput value={pwd} onChange={setPwd} placeholder="输入密码（至少 4 位）" show={show} setShow={setShow} autoFocus />
        <PwdInput value={pwd2} onChange={setPwd2} placeholder="再次输入密码" show={show} setShow={setShow} />
        {err && <p className="text-xs" style={{ color: 'var(--danger)' }}>{err}</p>}
        <button type="submit" disabled={busy} className="btn-primary w-full disabled:opacity-50">
          {busy ? '设置中...' : '设置密码'}
        </button>
      </form>
    </Wrapper>
  )
}

function UnlockForm({ onUnlocked }) {
  const [pwd, setPwd] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [show, setShow] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setErr(''); setBusy(true)
    try {
      const { data } = await privateUnlock(pwd)
      onUnlocked(data.token)
    } catch (e) {
      setErr(e.response?.data?.detail || '密码错误')
    } finally { setBusy(false) }
  }

  return (
    <Wrapper icon={<Lock size={40} />} title="私密书架" desc="请输入密码以访问私密书籍。">
      <form onSubmit={submit} className="space-y-3">
        <PwdInput value={pwd} onChange={setPwd} placeholder="密码" show={show} setShow={setShow} autoFocus />
        {err && <p className="text-xs" style={{ color: 'var(--danger)' }}>{err}</p>}
        <button type="submit" disabled={busy || !pwd} className="btn-primary w-full disabled:opacity-50">
          {busy ? '验证中...' : '解锁'}
        </button>
      </form>
    </Wrapper>
  )
}

function PwdInput({ value, onChange, placeholder, show, setShow, autoFocus }) {
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="input-themed w-full pr-10"
      />
      <button type="button" onClick={() => setShow(s => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-faint p-1">
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  )
}

function Wrapper({ icon, title, desc, children }) {
  return (
    <div className="flex items-center justify-center min-h-full p-8">
      <div className="card rounded-xl p-8 w-full max-w-sm border" style={{ borderColor: 'var(--border)' }}>
        <div className="flex flex-col items-center text-center mb-6">
          <div style={{ color: 'var(--accent)' }}>{icon}</div>
          <h2 className="text-lg font-semibold mt-3">{title}</h2>
          <p className="text-xs text-faint mt-2 leading-relaxed">{desc}</p>
        </div>
        {children}
      </div>
    </div>
  )
}
