import { useState, useEffect } from 'react'
import { Cpu, Cloud, Check, X, Loader2, Save, Zap, Tag, Sparkles, Plus, Trash2, Lock, ScanLine } from 'lucide-react'
import {
  getSettings, updateSettings, testLLM, testMinerU,
  getCategoriesConfig, updateCategoriesConfig, suggestCategories,
  privateStatus, privateSetPassword, privateLock,
} from '../api'

const PROVIDERS = [
  { id: 'ollama',   name: 'Ollama（本地）', type: 'local',  icon: Cpu },
  { id: 'deepseek', name: 'DeepSeek',       type: 'cloud',  icon: Cloud },
  { id: 'kimi',     name: 'Kimi (Moonshot)', type: 'cloud', icon: Cloud },
  { id: 'qwen',     name: 'Qwen (DashScope)', type: 'cloud', icon: Cloud },
  { id: 'minimax',  name: 'MiniMax',        type: 'cloud',  icon: Cloud },
  { id: 'openai',   name: 'OpenAI / ChatGPT', type: 'cloud', icon: Cloud },
]

export default function SettingsPage() {
  const [llm, setLlm] = useState(null)
  const [presets, setPresets] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  useEffect(() => {
    getSettings().then(({ data }) => {
      setLlm(data.llm)
      setPresets(data.presets)
    })
  }, [])

  function update(patch) {
    setLlm((l) => ({ ...l, ...patch }))
    setSaved(false)
    setTestResult(null)
  }

  function selectProvider(providerId) {
    const preset = presets[providerId] || {}
    update({
      provider: providerId,
      base_url: preset.base_url || '',
      model: preset.model || llm.model,
    })
  }

  async function handleSave() {
    setSaving(true)
    try {
      await updateSettings({ llm })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const { data } = await testLLM({
        provider: llm.provider,
        model: llm.model,
        api_key: llm.api_key,
        base_url: llm.base_url,
      })
      setTestResult(data)
    } finally {
      setTesting(false)
    }
  }

  if (!llm) return <div className="p-8 text-muted">加载中...</div>

  const currentProvider = PROVIDERS.find(p => p.id === llm.provider)
  const isLocal = llm.provider === 'ollama'

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold mb-2">设置</h1>
      <p className="text-sm text-muted mb-8">配置 LLM 提供方，本地模型无需 API Key</p>

      {/* Provider selection */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted mb-3">LLM 提供方</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {PROVIDERS.map((p) => {
            const Icon = p.icon
            const active = llm.provider === p.id
            return (
              <button
                key={p.id}
                onClick={() => selectProvider(p.id)}
                className="rounded-xl p-3 border text-left transition-all"
                style={{
                  background: active ? 'var(--accent-soft)' : 'var(--bg-card)',
                  borderColor: active ? 'var(--accent)' : 'var(--border)',
                  color: active ? 'var(--accent-text)' : 'var(--text)',
                }}
              >
                <div className="flex items-center gap-2">
                  <Icon size={14} />
                  <span className="text-sm font-medium">{p.name}</span>
                </div>
                <p className="text-xs text-faint mt-1">
                  {p.type === 'local' ? '离线·免费' : '云端·需 API Key'}
                </p>
              </button>
            )
          })}
        </div>
      </section>

      {/* Chat model config */}
      <section className="mb-8 card rounded-xl p-5 border">
        <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Zap size={14} /> 对话模型 · {currentProvider?.name}
        </h2>

        <Field label="模型名称">
          <input
            value={llm.model}
            onChange={(e) => update({ model: e.target.value })}
            className="input-themed w-full"
            placeholder={presets[llm.provider]?.model}
          />
        </Field>

        <Field label={`Base URL ${isLocal ? '(本地 Ollama 地址)' : ''}`}>
          <input
            value={llm.base_url}
            onChange={(e) => update({ base_url: e.target.value })}
            className="input-themed w-full"
            placeholder={presets[llm.provider]?.base_url}
          />
        </Field>

        {!isLocal && (
          <Field label="API Key">
            <input
              type="password"
              value={llm.api_key}
              onChange={(e) => update({ api_key: e.target.value })}
              className="input-themed w-full"
              placeholder={llm.api_key_set ? '••••••••（已设置，留空则保留）' : '请输入 API Key'}
            />
          </Field>
        )}

        <div className="flex items-center gap-3 mt-4">
          <button onClick={handleTest} disabled={testing} className="btn flex items-center gap-2">
            {testing ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            测试连接
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saved ? '已保存 ✓' : '保存'}
          </button>
        </div>

        {testResult && (
          <div
            className="mt-3 p-3 rounded-lg text-sm flex items-start gap-2"
            style={{
              background: testResult.ok ? 'var(--accent-soft)' : '#fca5a540',
              color: testResult.ok ? 'var(--accent-text)' : 'var(--danger)',
            }}
          >
            {testResult.ok ? <Check size={16} className="mt-0.5 shrink-0" /> : <X size={16} className="mt-0.5 shrink-0" />}
            <div>
              <p className="font-medium">{testResult.message}</p>
              {testResult.sample && <p className="text-xs mt-1 opacity-70">模型回复：{testResult.sample}</p>}
            </div>
          </div>
        )}
      </section>

      {/* Categories config */}
      <CategoriesSection />

      {/* Private shelf password */}
      <PrivateShelfSection />

      {/* MinerU OCR */}
      <MinerUSection />

      {/* Embed model config */}
      <section className="mb-8 card rounded-xl p-5 border">
        <h2 className="text-sm font-semibold mb-4">嵌入模型（用于语义搜索）</h2>

        <Field label="提供方">
          <select
            value={llm.embed_provider}
            onChange={(e) => update({ embed_provider: e.target.value })}
            className="input-themed w-full"
          >
            <option value="ollama">Ollama（本地）</option>
            <option value="openai">OpenAI 兼容</option>
          </select>
        </Field>

        <Field label="模型名称">
          <input
            value={llm.embed_model}
            onChange={(e) => update({ embed_model: e.target.value })}
            className="input-themed w-full"
            placeholder={llm.embed_provider === 'ollama' ? 'nomic-embed-text' : 'text-embedding-3-small'}
          />
        </Field>

        {llm.embed_provider !== 'ollama' && (
          <>
            <Field label="Base URL">
              <input
                value={llm.embed_base_url}
                onChange={(e) => update({ embed_base_url: e.target.value })}
                className="input-themed w-full"
                placeholder="https://api.openai.com/v1"
              />
            </Field>
            <Field label="API Key">
              <input
                type="password"
                value={llm.embed_api_key}
                onChange={(e) => update({ embed_api_key: e.target.value })}
                className="input-themed w-full"
                placeholder={llm.embed_api_key_set ? '••••••••（已设置）' : '可与对话模型共用'}
              />
            </Field>
          </>
        )}
      </section>
    </div>
  )
}

function CategoriesSection() {
  const [cats, setCats] = useState([])
  const [newCat, setNewCat] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [suggested, setSuggested] = useState(null)

  useEffect(() => { getCategoriesConfig().then(({ data }) => setCats(data.categories || [])) }, [])

  function add(val) {
    const v = (val || newCat).trim()
    if (!v || cats.includes(v)) return
    setCats(c => [...c, v])
    setNewCat('')
    setSaved(false)
  }

  function remove(c) {
    setCats(cs => cs.filter(x => x !== c))
    setSaved(false)
  }

  async function save() {
    setSaving(true)
    try {
      await updateCategoriesConfig(cats)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally { setSaving(false) }
  }

  async function askAI() {
    setSuggesting(true); setSuggested(null)
    try {
      const { data } = await suggestCategories()
      setSuggested(data.suggested || [])
    } catch (e) {
      alert('AI 建议失败：' + (e.response?.data?.detail || e.message))
    } finally { setSuggesting(false) }
  }

  function applySuggestion() {
    // merge suggested into current (dedup)
    const merged = []
    const seen = new Set()
    for (const c of [...suggested, ...cats]) {
      if (c && !seen.has(c)) { seen.add(c); merged.push(c) }
    }
    setCats(merged)
    setSuggested(null)
    setSaved(false)
  }

  function replaceWithSuggestion() {
    setCats(suggested)
    setSuggested(null)
    setSaved(false)
  }

  return (
    <section className="mb-8 card rounded-xl p-5 border">
      <h2 className="text-sm font-semibold mb-1 flex items-center gap-2">
        <Tag size={14} /> 分类目录
      </h2>
      <p className="text-xs text-faint mb-4">
        这些分类会用于「自动分类」。可手动增删，或让 AI 根据你当前的书库内容推荐一套分类体系。
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        {cats.map((c) => (
          <span key={c} className="chip-gray flex items-center gap-1 group">
            {c}
            <button onClick={() => remove(c)} className="opacity-60 hover:opacity-100">
              <X size={11} />
            </button>
          </span>
        ))}
        {cats.length === 0 && <span className="text-xs text-faint">暂无分类</span>}
      </div>

      <div className="flex gap-2 mb-3">
        <input
          value={newCat}
          onChange={(e) => setNewCat(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder="新增分类，回车添加"
          className="input-themed flex-1"
        />
        <button onClick={() => add()} className="btn flex items-center gap-1">
          <Plus size={14} /> 添加
        </button>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={askAI} disabled={suggesting} className="btn flex items-center gap-2">
          {suggesting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {suggesting ? 'AI 分析中...' : 'AI 建议分类'}
        </button>
        <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saved ? '已保存 ✓' : '保存'}
        </button>
      </div>

      {suggested && (
        <div className="mt-4 p-3 rounded-lg border" style={{ borderColor: 'var(--accent)', background: 'var(--accent-soft)' }}>
          <p className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--accent-text)' }}>
            AI 建议的分类（共 {suggested.length} 个）
          </p>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {suggested.map((c) => <span key={c} className="chip">{c}</span>)}
          </div>
          <div className="flex gap-2">
            <button onClick={applySuggestion} className="btn text-xs">合并到现有分类</button>
            <button onClick={replaceWithSuggestion} className="btn text-xs" style={{ color: 'var(--danger)' }}>
              替换现有分类
            </button>
            <button onClick={() => setSuggested(null)} className="btn text-xs">取消</button>
          </div>
        </div>
      )}
    </section>
  )
}

function Field({ label, children }) {
  return (
    <div className="mb-3">
      <label className="block text-xs font-medium text-muted mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function PrivateShelfSection() {
  const [status, setStatus] = useState(null)
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [newPwd2, setNewPwd2] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { refresh() }, [])
  function refresh() { privateStatus().then(({ data }) => setStatus(data)).catch(() => {}) }

  async function submit(e) {
    e.preventDefault()
    setMsg(''); setErr('')
    if (newPwd.length < 4) return setErr('新密码至少 4 位')
    if (newPwd !== newPwd2) return setErr('两次密码不一致')
    setBusy(true)
    try {
      await privateSetPassword(newPwd, oldPwd || undefined)
      setMsg(status?.has_password ? '密码已更新，所有登录已失效' : '密码已设置')
      setOldPwd(''); setNewPwd(''); setNewPwd2('')
      localStorage.removeItem('privateToken')
      refresh()
    } catch (e) {
      setErr(e.response?.data?.detail || '操作失败')
    } finally { setBusy(false) }
  }

  async function lock() {
    await privateLock().catch(() => {})
    localStorage.removeItem('privateToken')
    refresh()
  }

  return (
    <section className="mb-8 card rounded-xl p-5 border">
      <h2 className="text-sm font-semibold mb-1 flex items-center gap-2"><Lock size={14} /> 私密书架</h2>
      <p className="text-xs text-faint mb-4">
        私密书架中的书籍不会出现在主书架、搜索、知识图谱中。访问需要密码，刷新/重启后需重新解锁。
      </p>

      <form onSubmit={submit} className="space-y-3 max-w-md">
        {status?.has_password && (
          <Field label="当前密码">
            <input type="password" value={oldPwd} onChange={(e) => setOldPwd(e.target.value)}
              className="input-themed w-full" placeholder="修改密码时必填" />
          </Field>
        )}
        <Field label={status?.has_password ? '新密码' : '设置密码'}>
          <input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)}
            className="input-themed w-full" placeholder="至少 4 位" />
        </Field>
        <Field label="确认新密码">
          <input type="password" value={newPwd2} onChange={(e) => setNewPwd2(e.target.value)}
            className="input-themed w-full" />
        </Field>

        {err && <p className="text-xs" style={{ color: 'var(--danger)' }}>{err}</p>}
        {msg && <p className="text-xs" style={{ color: 'var(--accent)' }}>{msg}</p>}

        <div className="flex items-center gap-2">
          <button type="submit" disabled={busy} className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-50">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            {status?.has_password ? '修改密码' : '设置密码'}
          </button>
          {status?.unlocked && (
            <button type="button" onClick={lock} className="btn text-sm flex items-center gap-1.5">
              <Lock size={13} /> 锁定
            </button>
          )}
          {status?.unlocked && <span className="text-xs text-faint">当前已解锁</span>}
        </div>
      </form>
    </section>
  )
}

function MinerUSection() {
  const [cfg, setCfg] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  useEffect(() => {
    getSettings().then(({ data }) => {
      const m = data.mineru || {}
      setCfg({
        enabled: !!m.enabled,
        api_token: '',
        api_token_set: !!m.api_token_set,
        base_url: m.base_url || 'https://mineru.net',
        is_ocr: m.is_ocr !== false,
        enable_formula: m.enable_formula !== false,
        enable_table: m.enable_table !== false,
        language: m.language || 'ch',
      })
    })
  }, [])

  function patch(p) { setCfg(c => ({ ...c, ...p })); setSaved(false); setTestResult(null) }

  async function save() {
    setSaving(true)
    try {
      const payload = { ...cfg }
      delete payload.api_token_set
      await updateSettings({ mineru: payload })
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } finally { setSaving(false) }
  }

  async function test() {
    setTesting(true); setTestResult(null)
    try {
      const { data } = await testMinerU({ api_token: cfg.api_token, base_url: cfg.base_url })
      setTestResult(data)
    } catch (e) {
      setTestResult({ ok: false, message: e.response?.data?.detail || String(e) })
    } finally { setTesting(false) }
  }

  if (!cfg) return null

  return (
    <section className="mb-8 card rounded-xl p-5 border">
      <h2 className="text-sm font-semibold mb-1 flex items-center gap-2">
        <ScanLine size={14} /> MinerU · 图像 PDF / 扫描件解析
      </h2>
      <p className="text-xs text-faint mb-4 leading-relaxed">
        配置 MinerU 云端 API，用于解析纯图像 / 扫描类 PDF（OCR + 公式 + 表格 → Markdown），结果自动用于生成摘要和 RAG 全文索引。
        申请 Token：<a href="https://mineru.net" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>mineru.net</a>
      </p>

      <label className="flex items-center gap-2 mb-3 cursor-pointer">
        <input type="checkbox" checked={cfg.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />
        <span className="text-sm">启用 MinerU</span>
      </label>

      <Field label="API Token">
        <input type="password" value={cfg.api_token}
          onChange={(e) => patch({ api_token: e.target.value })}
          className="input-themed w-full"
          placeholder={cfg.api_token_set ? '••••••••（已设置，留空则保留）' : 'eyJxxx...'} />
      </Field>

      <Field label="Base URL">
        <input value={cfg.base_url} onChange={(e) => patch({ base_url: e.target.value })}
          className="input-themed w-full" placeholder="https://mineru.net" />
      </Field>

      <Field label="语言">
        <select value={cfg.language} onChange={(e) => patch({ language: e.target.value })}
          className="input-themed w-full">
          <option value="ch">中文</option>
          <option value="en">英文</option>
          <option value="auto">自动识别</option>
        </select>
      </Field>

      <div className="flex flex-wrap gap-4 mt-2 mb-4 text-sm">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={cfg.is_ocr} onChange={(e) => patch({ is_ocr: e.target.checked })} />
          启用 OCR（扫描件必选）
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={cfg.enable_formula} onChange={(e) => patch({ enable_formula: e.target.checked })} />
          公式识别
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={cfg.enable_table} onChange={(e) => patch({ enable_table: e.target.checked })} />
          表格识别
        </label>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={test} disabled={testing} className="btn flex items-center gap-1.5 text-sm disabled:opacity-50">
          {testing ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          测试连接
        </button>
        <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-1.5 text-sm disabled:opacity-50">
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          {saved ? '已保存 ✓' : '保存'}
        </button>
      </div>

      {testResult && (
        <div className="mt-3 p-2 rounded-lg text-xs flex items-start gap-2"
          style={{ background: testResult.ok ? 'var(--accent-soft)' : '#fca5a540',
                   color: testResult.ok ? 'var(--accent-text)' : 'var(--danger)' }}>
          {testResult.ok ? <Check size={14} className="mt-0.5 shrink-0" /> : <X size={14} className="mt-0.5 shrink-0" />}
          <span>{testResult.message}</span>
        </div>
      )}
    </section>
  )
}
