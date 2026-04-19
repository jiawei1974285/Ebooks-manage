import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Loader2, Sparkles, Tag, FileText, User,
  Building, Calendar, Globe, BookOpen, Hash, Trash2, Eye, BookMarked,
  Pencil, Check, X, Plus, Lock, Unlock, ScanLine, ExternalLink, FolderOpen,
} from 'lucide-react'
import {
  getBook, generateSummary, classifyBook, embedBook, updateBook, deleteBook, indexBook,
  getCategoriesConfig, mineruParse, bookFileUrl, openBookLocal, autoTagBook,
} from '../api'
import PdfPreview from '../components/PdfPreview'
import StarRating from '../components/StarRating'

export default function BookDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [book, setBook] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState({})
  const [tagInput, setTagInput] = useState('')
  const [editing, setEditing] = useState({})
  const [previewing, setPreviewing] = useState(false)
  const [allCategories, setAllCategories] = useState([])
  const [addingCategory, setAddingCategory] = useState(false)

  useEffect(() => {
    getBook(id).then(({ data }) => { setBook(data); setLoading(false) })
    getCategoriesConfig().then(({ data }) => setAllCategories(data.categories || [])).catch(() => {})
  }, [id])

  async function run(key, fn, update) {
    setBusy(b => ({ ...b, [key]: true }))
    try { const { data } = await fn(); update(data) }
    finally { setBusy(b => ({ ...b, [key]: false })) }
  }

  async function saveField(field, value) {
    await updateBook(id, { [field]: value })
    setBook(b => ({ ...b, [field]: value }))
    setEditing(e => ({ ...e, [field]: false }))
  }

  async function addTag(tag) {
    const t = tag.trim()
    if (!t || book.tags.includes(t)) return
    const newTags = [...book.tags, t]
    await updateBook(id, { tags: newTags })
    setBook(b => ({ ...b, tags: newTags }))
    setTagInput('')
  }

  async function removeTag(tag) {
    const newTags = book.tags.filter(t => t !== tag)
    await updateBook(id, { tags: newTags })
    setBook(b => ({ ...b, tags: newTags }))
  }

  async function addCategory(cat) {
    const c = cat.trim()
    if (!c || book.categories.includes(c)) return
    const newCats = [...book.categories, c]
    await updateBook(id, { categories: newCats })
    setBook(b => ({ ...b, categories: newCats }))
    setAddingCategory(false)
  }

  async function removeCategory(cat) {
    const newCats = book.categories.filter(c => c !== cat)
    await updateBook(id, { categories: newCats })
    setBook(b => ({ ...b, categories: newCats }))
  }

  async function handleDelete() {
    if (!confirm('确认从书库移除（不会删除文件）？')) return
    await deleteBook(id); navigate('/')
  }

  if (loading) return <div className="flex items-center justify-center h-full text-muted">加载中...</div>
  if (!book) return <div className="flex items-center justify-center h-full text-muted">未找到书籍</div>

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-muted hover:opacity-70 mb-6 text-sm">
        <ArrowLeft size={16} /> 返回
      </button>

      <div className="flex gap-8">
        {/* Cover & actions */}
        <div className="shrink-0">
          <div
            className="w-44 aspect-[3/4] rounded-xl overflow-hidden border shadow-xl"
            style={{ background: 'var(--bg-hover)', borderColor: 'var(--border)' }}
          >
            {book.cover_url ? (
              <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-faint">
                <FileText size={40} />
                <span className="text-xs font-bold uppercase">{book.file_format}</span>
              </div>
            )}
          </div>
          <div className="mt-3 space-y-2">
            <ActionBtn
              onClick={() => run('sum', () => generateSummary(id), d => setBook(b => ({ ...b, summary: d.summary })))}
              loading={busy.sum} icon={<Sparkles size={14} />} label="生成摘要"
            />
            <ActionBtn
              onClick={() => run('cls', () => classifyBook(id), d => setBook(b => ({ ...b, categories: d.categories })))}
              loading={busy.cls} icon={<Tag size={14} />} label="自动分类"
            />
            <ActionBtn
              onClick={() => run('tag', () => autoTagBook(id), d => setBook(b => ({ ...b, tags: d.tags })))}
              loading={busy.tag} icon={<Tag size={14} />} label="AI 打标签"
            />
            <ActionBtn
              onClick={() => run('emb', () => embedBook(id), () => setBook(b => ({ ...b, embedding_done: true })))}
              loading={busy.emb} icon={<Hash size={14} />}
              label={book.embedding_done ? '已向量化 ✓' : '加入向量搜索'}
              disabled={book.embedding_done}
            />
            <ActionBtn
              onClick={() => run('idx', () => indexBook(id), d => setBook(b => ({ ...b, indexed: true, chunk_count: d.chunks })))}
              loading={busy.idx} icon={<BookMarked size={14} />}
              label={book.indexed ? `已索引 ${book.chunk_count} 段 ✓` : '全文索引 (RAG)'}
              disabled={book.indexed}
            />
            {book.file_format === 'PDF' && (
              <button
                onClick={() => setPreviewing(true)}
                className="btn w-full flex items-center justify-center gap-1.5 text-xs"
              >
                <Eye size={13} /> 预览 PDF
              </button>
            )}
            {book.file_format === 'PDF' && (
              <ActionBtn
                onClick={() => run('mineru', () => mineruParse(id, { auto_summary: true, auto_index: true }),
                  d => setBook(b => ({
                    ...b,
                    summary: d.summary || b.summary,
                    indexed: d.chunks ? true : b.indexed,
                    chunk_count: d.chunks || b.chunk_count,
                  })))}
                loading={busy.mineru} icon={<ScanLine size={13} />}
                label="MinerU 解析（扫描件）"
              />
            )}
            <button
              onClick={() => saveField('is_private', !book.is_private)}
              className="btn w-full flex items-center justify-center gap-1.5 text-xs"
              title={book.is_private ? '点击移出私密书架' : '设为私密，需密码访问'}
            >
              {book.is_private ? <Lock size={13} /> : <Unlock size={13} />}
              {book.is_private ? '已设为私密' : '设为私密'}
            </button>
            <button
              onClick={handleDelete}
              className="w-full flex items-center justify-center gap-1.5 text-xs rounded-lg py-2 border transition-colors"
              style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
            >
              <Trash2 size={13} /> 移除
            </button>
          </div>
          {book.page_count > 0 && book.reading_progress > 0 && (
            <div className="mt-3 w-44">
              <div className="flex items-center justify-between text-[10px] text-faint mb-1">
                <span>阅读进度</span>
                <span>{book.last_page} / {book.page_count}</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-hover)' }}>
                <div className="h-full" style={{ width: `${Math.min(book.reading_progress, 100)}%`, background: 'var(--accent)' }} />
              </div>
            </div>
          )}
        </div>

        {/* Metadata */}
        <div className="flex-1 min-w-0">
          {/* Title — inline editable */}
          {editing.title ? (
            <EditableField defaultValue={book.title} onSave={(v) => saveField('title', v)} onCancel={() => setEditing(e => ({ ...e, title: false }))} large />
          ) : (
            <h1
              className="text-2xl font-bold mb-1 group cursor-text flex items-start gap-2"
              onClick={() => setEditing(e => ({ ...e, title: true }))}
            >
              <span>{book.title}</span>
              <Pencil size={14} className="opacity-0 group-hover:opacity-60 mt-2 shrink-0" />
            </h1>
          )}

          <div className="flex items-center gap-3 mb-4">
            <StarRating value={book.rating || 0} size={22} onChange={(v) => saveField('rating', v)} />
            {book.rating > 0 && <span className="text-xs text-faint">{book.rating} / 5</span>}
            <span className="text-xs text-faint ml-auto">点击任意字段可直接编辑</span>
          </div>

          <div className="space-y-1">
            <MetaRowEditable icon={<User size={14} />} label="作者" value={book.author}
              editing={editing.author} setEditing={(v) => setEditing(e => ({ ...e, author: v }))}
              onSave={(v) => saveField('author', v)} />
            <MetaRowEditable icon={<Building size={14} />} label="出版社" value={book.publisher}
              editing={editing.publisher} setEditing={(v) => setEditing(e => ({ ...e, publisher: v }))}
              onSave={(v) => saveField('publisher', v)} />
            <MetaRowEditable icon={<Calendar size={14} />} label="日期" value={book.publish_date}
              editing={editing.publish_date} setEditing={(v) => setEditing(e => ({ ...e, publish_date: v }))}
              onSave={(v) => saveField('publish_date', v)} />
            <MetaRowEditable icon={<Globe size={14} />} label="语言" value={book.language}
              editing={editing.language} setEditing={(v) => setEditing(e => ({ ...e, language: v }))}
              onSave={(v) => saveField('language', v)} />
            <MetaRow icon={<BookOpen size={14} />} label="页数">{book.page_count || '-'}</MetaRow>
            <MetaRow icon={<FileText size={14} />} label="格式">
              <span className="inline-flex items-center gap-2">
                {book.file_format}
                {book.mineru_parsed && (
                  <span className="chip inline-flex items-center gap-0.5" title="已用 MinerU OCR 解析">
                    <ScanLine size={10} /> MinerU
                  </span>
                )}
              </span>
            </MetaRow>
            <MetaRow icon={<FileText size={14} />} label="路径">
              <div className="flex flex-col gap-1 min-w-0">
                <span className="text-xs text-faint break-all">{book.file_path}</span>
                <div className="flex items-center gap-3 text-xs">
                  <a
                    href={bookFileUrl(book.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-accent hover:underline"
                    title="在浏览器新标签中打开"
                  >
                    <ExternalLink size={12} /> 在浏览器打开
                  </a>
                  <button
                    type="button"
                    onClick={async () => {
                      try { await openBookLocal(book.id, false) }
                      catch (e) { alert(e?.response?.data?.detail || '打开失败') }
                    }}
                    className="inline-flex items-center gap-1 text-accent hover:underline"
                    title="用本机默认程序打开原文件"
                  >
                    <BookOpen size={12} /> 用默认程序打开
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try { await openBookLocal(book.id, true) }
                      catch (e) { alert(e?.response?.data?.detail || '打开失败') }
                    }}
                    className="inline-flex items-center gap-1 text-accent hover:underline"
                    title="在文件管理器中定位文件"
                  >
                    <FolderOpen size={12} /> 打开所在文件夹
                  </button>
                </div>
              </div>
            </MetaRow>
          </div>

          {/* Categories — editable chips */}
          <div className="mt-5">
            <p className="text-xs font-semibold text-faint uppercase tracking-wider mb-2">分类</p>
            <div className="flex flex-wrap gap-2 items-center">
              {book.categories?.map(c => (
                <span key={c} onClick={() => removeCategory(c)} className="chip cursor-pointer hover:opacity-60" title="点击移除">
                  {c} ×
                </span>
              ))}
              {addingCategory ? (
                <CategoryPicker
                  available={allCategories.filter(c => !book.categories.includes(c))}
                  onPick={addCategory}
                  onCancel={() => setAddingCategory(false)}
                />
              ) : (
                <button
                  onClick={() => setAddingCategory(true)}
                  className="text-xs flex items-center gap-1 px-2 py-1 rounded-md border border-dashed transition-colors"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                >
                  <Plus size={12} /> 添加分类
                </button>
              )}
              {(!book.categories || book.categories.length === 0) && !addingCategory && (
                <span className="text-faint text-sm">点击「自动分类」或手动添加</span>
              )}
            </div>
          </div>

          {/* Tags */}
          <div className="mt-5">
            <p className="text-xs font-semibold text-faint uppercase tracking-wider mb-2">标签</p>
            <div className="flex flex-wrap gap-2 mb-2">
              {book.tags?.map(t => (
                <span key={t} onClick={() => removeTag(t)} className="chip-gray cursor-pointer hover:opacity-60">
                  {t} ×
                </span>
              ))}
            </div>
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addTag(tagInput) }}
              placeholder="输入标签，按 Enter 添加"
              className="input-themed w-full"
            />
          </div>

          {/* Summary — editable textarea */}
          <EditableTextArea
            label="摘要"
            value={book.summary}
            editing={editing.summary}
            setEditing={(v) => setEditing(e => ({ ...e, summary: v }))}
            onSave={(v) => saveField('summary', v)}
            placeholder="暂无摘要，点击「生成摘要」或手动输入"
            rows={6}
          />

          {/* Description — editable textarea */}
          <EditableTextArea
            label="简介"
            value={book.description}
            editing={editing.description}
            setEditing={(v) => setEditing(e => ({ ...e, description: v }))}
            onSave={(v) => saveField('description', v)}
            placeholder="暂无简介，点击添加"
            rows={4}
          />

          {/* Review — editable textarea */}
          <EditableTextArea
            label="我的评论"
            value={book.review}
            editing={editing.review}
            setEditing={(v) => setEditing(e => ({ ...e, review: v }))}
            onSave={(v) => saveField('review', v)}
            placeholder="写下你对这本书的感想、笔记..."
            rows={5}
          />
        </div>
      </div>

      {previewing && (
        <PdfPreview
          book={book}
          onClose={() => setPreviewing(false)}
          onProgressSaved={(p) => setBook((b) => ({
            ...b,
            last_page: p,
            reading_progress: b.page_count ? Math.round(p / b.page_count * 1000) / 10 : 0,
          }))}
        />
      )}
    </div>
  )
}

function MetaRow({ icon, label, children }) {
  return (
    <div className="flex items-start gap-2 text-sm py-1">
      <span className="text-faint mt-0.5 shrink-0">{icon}</span>
      <span className="text-faint shrink-0 w-14">{label}</span>
      <span>{children}</span>
    </div>
  )
}

function MetaRowEditable({ icon, label, value, editing, setEditing, onSave }) {
  return (
    <div className="flex items-start gap-2 text-sm py-1 group">
      <span className="text-faint mt-0.5 shrink-0">{icon}</span>
      <span className="text-faint shrink-0 w-14">{label}</span>
      {editing ? (
        <EditableField inline defaultValue={value || ''} onSave={onSave} onCancel={() => setEditing(false)} />
      ) : (
        <span
          onClick={() => setEditing(true)}
          className="cursor-text rounded px-1 -mx-1 transition-colors flex items-center gap-1.5 flex-1 min-w-0"
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <span className={value ? '' : 'text-faint italic'}>{value || '点击添加'}</span>
          <Pencil size={11} className="opacity-0 group-hover:opacity-60 shrink-0" />
        </span>
      )}
    </div>
  )
}

function ActionBtn({ onClick, loading, icon, label, disabled }) {
  return (
    <button onClick={onClick} disabled={loading || disabled} className="btn w-full flex items-center justify-center gap-1.5 text-xs disabled:opacity-50">
      {loading ? <Loader2 size={13} className="animate-spin" /> : icon}
      {label}
    </button>
  )
}

function EditableField({ defaultValue, onSave, onCancel, inline, large }) {
  const [val, setVal] = useState(defaultValue)
  return (
    <div className="flex items-center gap-2 flex-1">
      <input
        autoFocus value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onSave(val); if (e.key === 'Escape') onCancel() }}
        className={`input-themed ${large ? 'text-xl font-bold w-full' : (inline ? 'flex-1' : 'w-full')}`}
      />
      <button onClick={() => onSave(val)} className="text-xs p-1" style={{ color: 'var(--accent)' }} title="保存 (Enter)">
        <Check size={14} />
      </button>
      <button onClick={onCancel} className="text-xs p-1 text-faint" title="取消 (Esc)">
        <X size={14} />
      </button>
    </div>
  )
}

function EditableTextArea({ label, value, editing, setEditing, onSave, placeholder, rows = 4 }) {
  const [val, setVal] = useState(value || '')

  if (editing) {
    return (
      <div className="mt-5">
        <p className="text-xs font-semibold text-faint uppercase tracking-wider mb-2">{label}</p>
        <textarea
          autoFocus
          value={val}
          onChange={(e) => setVal(e.target.value)}
          rows={rows}
          className="input-themed w-full resize-y"
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setEditing(false); setVal(value || '') }
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { onSave(val) }
          }}
        />
        <div className="flex items-center gap-2 mt-2">
          <button onClick={() => onSave(val)} className="btn-primary text-xs flex items-center gap-1">
            <Check size={12} /> 保存 (Ctrl+Enter)
          </button>
          <button onClick={() => { setEditing(false); setVal(value || '') }} className="btn text-xs">
            取消
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-5 group">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-faint uppercase tracking-wider">{label}</p>
        <button onClick={() => { setVal(value || ''); setEditing(true) }}
          className="text-xs text-faint opacity-0 group-hover:opacity-100 flex items-center gap-1 hover:opacity-80"
        >
          <Pencil size={11} /> 编辑
        </button>
      </div>
      {value ? (
        <p
          className="text-sm leading-relaxed rounded-xl p-4 border card cursor-text whitespace-pre-wrap"
          onClick={() => { setVal(value); setEditing(true) }}
        >{value}</p>
      ) : (
        <p
          className="text-sm text-faint italic cursor-text"
          onClick={() => { setVal(''); setEditing(true) }}
        >{placeholder}</p>
      )}
    </div>
  )
}

function CategoryPicker({ available, onPick, onCancel }) {
  const [val, setVal] = useState('')
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <input
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && val.trim()) onPick(val.trim())
          if (e.key === 'Escape') onCancel()
        }}
        list="category-options"
        className="input-themed text-xs py-1 w-32"
        placeholder="输入或选择"
      />
      <datalist id="category-options">
        {available.map(c => <option key={c} value={c} />)}
      </datalist>
      <button onClick={() => val.trim() && onPick(val.trim())} className="p-1" style={{ color: 'var(--accent)' }}>
        <Check size={14} />
      </button>
      <button onClick={onCancel} className="p-1 text-faint"><X size={14} /></button>
    </div>
  )
}
