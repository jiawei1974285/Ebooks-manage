import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Search, FolderOpen, RefreshCw, X, ArrowDownAZ, Sparkles, Tag, Hash, Loader2, ChevronDown,
  BookMarked, Trash2, LayoutGrid, List, Pencil, CheckSquare, Square, ScanLine, ChevronRight,
} from 'lucide-react'
import BookCard, { BookCardSkeleton } from '../components/BookCard'
import ScanModal from '../components/ScanModal'
import DropZone from '../components/DropZone'
import { useProgress } from '../contexts/ProgressContext'
import {
  getBooks, getCategories, getTags, search as searchApi,
  updateBook, deleteBook, getCategoriesConfig, batchStreamUrl,
} from '../api'

const SORT_OPTIONS = [
  { value: 'created_desc', label: '最近添加' },
  { value: 'created_asc', label: '最早添加' },
  { value: 'title', label: '书名' },
  { value: 'author', label: '作者' },
  { value: 'size_desc', label: '文件大小' },
  { value: 'rating_desc', label: '评分' },
  { value: 'last_read_desc', label: '最近阅读' },
]

export default function Library({ scope = 'public' }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const page = parseInt(searchParams.get('page') || '1', 10)
  const activeCategory = searchParams.get('category') || ''
  const activeFormat = searchParams.get('format') || ''
  const query = searchParams.get('q') || ''
  const sort = searchParams.get('sort') || 'created_desc'
  const tagsParam = searchParams.get('tags') || ''
  const activeTags = tagsParam ? tagsParam.split(',').filter(Boolean) : []
  const tagMode = searchParams.get('tag_mode') || 'and'
  const mineruFilter = searchParams.get('mineru') || '' // '' | '1' | '0'

  function updateParams(patch, { resetPage = false } = {}) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      for (const [k, v] of Object.entries(patch)) {
        if (v === '' || v == null) next.delete(k)
        else next.set(k, String(v))
      }
      if (resetPage) next.delete('page')
      return next
    }, { replace: false })
  }

  const [books, setBooks] = useState([])
  const [total, setTotal] = useState(0)
  const [categories, setCategories] = useState([])
  const [allTags, setAllTags] = useState([])
  const [searchInput, setSearchInput] = useState(query)
  const [loading, setLoading] = useState(false)
  const [showScan, setShowScan] = useState(false)
  const [view, setView] = useState(() => localStorage.getItem('libraryView') || 'grid')
  useEffect(() => { localStorage.setItem('libraryView', view) }, [view])
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchResult, setBatchResult] = useState(null)
  const { startBatch } = useProgress()
  const [selected, setSelected] = useState(new Set())
  const [catModalOpen, setCatModalOpen] = useState(false)
  const [metaModalOpen, setMetaModalOpen] = useState(false)
  const [allCategories, setAllCategories] = useState([])
  const lastClickedId = useRef(null)
  const PAGE_SIZE = 24

  const loadCategories = useCallback(() => {
    getCategories({ scope }).then(({ data }) => setCategories(data))
  }, [scope])

  const loadTags = useCallback(() => {
    getTags({ scope }).then(({ data }) => setAllTags(data || [])).catch(() => {})
  }, [scope])

  const loadBooks = useCallback(async () => {
    setLoading(true)
    try {
      if (query) {
        const { data } = await searchApi(query, 'hybrid')
        setBooks(data.results); setTotal(data.total)
      } else {
        const { data } = await getBooks({
          page, page_size: PAGE_SIZE, sort,
          category: activeCategory || undefined,
          format: activeFormat || undefined,
          tags: activeTags.length ? activeTags.join(',') : undefined,
          tag_mode: activeTags.length > 1 ? tagMode : undefined,
          mineru_parsed: mineruFilter === '1' ? true : mineruFilter === '0' ? false : undefined,
          scope,
        })
        setBooks(data.books); setTotal(data.total)
      }
    } finally { setLoading(false) }
  }, [page, activeCategory, activeFormat, query, sort, scope, tagsParam, tagMode, mineruFilter])

  useEffect(() => { loadCategories() }, [loadCategories])
  useEffect(() => { loadTags() }, [loadTags])
  useEffect(() => {
    getCategoriesConfig().then(({ data }) => setAllCategories(data.categories || [])).catch(() => {})
  }, [])
  useEffect(() => { loadBooks() }, [loadBooks])
  useEffect(() => { setSearchInput(query) }, [query])

  // Ctrl+A to select all on page; Esc to clear
  useEffect(() => {
    function onKey(e) {
      const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)
      if (typing) return
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault()
        setSelected(new Set(books.map(b => b.id)))
      } else if (e.key === 'Escape') {
        setSelected(new Set())
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [books])

  function handleSearch(e) {
    e.preventDefault()
    updateParams({ q: searchInput, category: '', format: '' }, { resetPage: true })
  }

  function clearSearch() { setSearchInput(''); updateParams({ q: '' }, { resetPage: true }) }

  function toggleSelect(id, e) {
    setSelected(prev => {
      const next = new Set(prev)
      if (e?.shiftKey && lastClickedId.current != null) {
        const ids = books.map(b => b.id)
        const a = ids.indexOf(lastClickedId.current)
        const b = ids.indexOf(id)
        if (a >= 0 && b >= 0) {
          const [lo, hi] = a < b ? [a, b] : [b, a]
          for (let i = lo; i <= hi; i++) next.add(ids[i])
        }
      } else if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      lastClickedId.current = id
      return next
    })
  }

  function runBatch(action) {
    setBatchResult(null); setBatchOpen(false)
    const book_ids = selected.size > 0 ? [...selected] : undefined
    startBatch(batchStreamUrl(action, book_ids), {
      onDone: (res) => { setBatchResult(res); loadBooks(); loadCategories(); loadTags() },
    })
  }

  function toggleTag(name) {
    const next = activeTags.includes(name)
      ? activeTags.filter(t => t !== name)
      : [...activeTags, name]
    updateParams({ tags: next.join(',') }, { resetPage: true })
  }

  async function bulkDelete() {
    if (!confirm(`从书库移除 ${selected.size} 本书？（不会删除文件）`)) return
    for (const id of selected) { try { await deleteBook(id) } catch {} }
    setSelected(new Set()); loadBooks(); loadCategories()
  }

  async function bulkApplyCategory({ name, mode }) {
    const cat = name.trim()
    if (!cat) return
    for (const id of selected) {
      const book = books.find(b => b.id === id); if (!book) continue
      let cats
      if (mode === 'replace') {
        cats = [cat]
      } else if (mode === 'remove') {
        cats = (book.categories || []).filter(c => c !== cat)
      } else {
        cats = [...(book.categories || [])]
        if (!cats.includes(cat)) cats.push(cat)
      }
      try { await updateBook(id, { categories: cats }) } catch {}
    }
    setCatModalOpen(false); setSelected(new Set()); loadBooks(); loadCategories()
  }

  async function bulkApplyMeta({ field, value, onlyEmpty }) {
    const val = (value ?? '').trim()
    for (const id of selected) {
      const book = books.find(b => b.id === id); if (!book) continue
      if (onlyEmpty && book[field]) continue
      try { await updateBook(id, { [field]: val }) } catch {}
    }
    setMetaModalOpen(false); setSelected(new Set()); loadBooks()
  }

  async function bulkAddTag() {
    const tag = prompt('输入要批量添加的标签：')?.trim()
    if (!tag) return
    for (const id of selected) {
      const book = books.find(b => b.id === id); if (!book) continue
      const tags = [...(book.tags || [])]
      if (!tags.includes(tag)) tags.push(tag)
      try { await updateBook(id, { tags }) } catch {}
    }
    setSelected(new Set()); loadBooks()
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const selectMode = selected.size > 0

  return (
    <DropZone onDone={() => { loadBooks(); loadCategories() }}>
    <div className="flex h-full">
      <aside
        className="w-56 flex flex-col shrink-0 border-r overflow-hidden"
        style={{ background: 'var(--bg-panel)', borderColor: 'var(--border)' }}
      >
        <div className="flex-1 overflow-y-auto">
          <FilterSection title="分类" badge={activeCategory ? 1 : 0} storageKey="lib:cat" defaultOpen>
            <div className="max-h-[38vh] overflow-y-auto pr-1">
              <SideBtn active={!activeCategory} onClick={() => updateParams({ category: '' }, { resetPage: true })}>
                全部 ({total})
              </SideBtn>
              {categories.map((cat) => (
                <SideBtn key={cat.name} active={activeCategory === cat.name}
                  onClick={() => { updateParams({ category: cat.name, q: '' }, { resetPage: true }); setSearchInput('') }}>
                  {cat.name} ({cat.count})
                </SideBtn>
              ))}
            </div>
          </FilterSection>

          <FilterSection title="格式" badge={activeFormat ? 1 : 0} storageKey="lib:fmt">
            <div className="flex flex-wrap gap-1.5 px-4 pb-1">
              {['PDF', 'EPUB', 'MOBI'].map((fmt) => {
                const on = activeFormat === fmt
                return (
                  <button key={fmt}
                    onClick={() => updateParams({ format: on ? '' : fmt }, { resetPage: true })}
                    className="text-[11px] px-2 py-0.5 rounded-full border transition-colors"
                    style={{
                      background: on ? 'var(--accent-soft)' : 'transparent',
                      borderColor: on ? 'var(--accent)' : 'var(--border)',
                      color: on ? 'var(--accent)' : 'var(--text-muted)',
                    }}>
                    {fmt}
                  </button>
                )
              })}
            </div>
          </FilterSection>

          <FilterSection title="OCR" badge={mineruFilter ? 1 : 0} storageKey="lib:ocr">
            <div className="flex flex-wrap gap-1.5 px-4 pb-1">
              {[
                { v: '1', label: '已解析' },
                { v: '0', label: '未解析' },
              ].map(({ v, label }) => {
                const on = mineruFilter === v
                return (
                  <button key={v}
                    onClick={() => updateParams({ mineru: on ? '' : v }, { resetPage: true })}
                    className="text-[11px] px-2 py-0.5 rounded-full border transition-colors"
                    style={{
                      background: on ? 'var(--accent-soft)' : 'transparent',
                      borderColor: on ? 'var(--accent)' : 'var(--border)',
                      color: on ? 'var(--accent)' : 'var(--text-muted)',
                    }}>
                    {label}
                  </button>
                )
              })}
            </div>
          </FilterSection>

          {allTags.length > 0 && (
            <FilterSection title="标签" badge={activeTags.length} storageKey="lib:tags" defaultOpen>
              <div className="px-4 pb-2">
                <div className="flex items-center justify-between mb-1.5">
                  {activeTags.length > 1 ? (
                    <button
                      onClick={() => updateParams({ tag_mode: tagMode === 'and' ? 'or' : 'and' }, { resetPage: true })}
                      className="text-[10px] px-1.5 py-0.5 rounded border"
                      style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}
                      title="点击切换标签逻辑">
                      {tagMode === 'and' ? '全部包含' : '任一包含'}
                    </button>
                  ) : <span />}
                  {activeTags.length > 0 && (
                    <button
                      onClick={() => updateParams({ tags: '' }, { resetPage: true })}
                      className="text-[10px] text-faint hover:underline">
                      清除 {activeTags.length}
                    </button>
                  )}
                </div>
                <div className="max-h-[36vh] overflow-y-auto flex flex-wrap gap-1 pr-1">
                  {allTags.map(t => {
                    const on = activeTags.includes(t.name)
                    return (
                      <button key={t.name} onClick={() => toggleTag(t.name)}
                        className="text-[11px] px-1.5 py-0.5 rounded border transition-colors truncate max-w-full"
                        style={{
                          background: on ? 'var(--accent-soft)' : 'transparent',
                          borderColor: on ? 'var(--accent)' : 'var(--border)',
                          color: on ? 'var(--accent)' : 'var(--text-muted)',
                        }}
                        title={`${t.name} (${t.count})`}>
                        {t.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            </FilterSection>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div
          className="flex items-center gap-3 px-6 py-4 border-b shrink-0"
          style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
        >
          <form onSubmit={handleSearch} className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              data-shortcut="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="搜索书名、作者（按 / 聚焦，支持语义搜索）..."
              className="input-themed w-full pl-9 pr-9"
            />
            {searchInput && (
              <button type="button" onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-faint">
                <X size={14} />
              </button>
            )}
          </form>

          <div className="relative">
            <select value={sort} onChange={(e) => updateParams({ sort: e.target.value })} className="input-themed pr-8 appearance-none">
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <ArrowDownAZ size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
          </div>

          {books.length > 0 && (() => {
            const allOnPage = books.every(b => selected.has(b.id))
            const toggleAll = () => {
              if (allOnPage) {
                setSelected(prev => {
                  const next = new Set(prev)
                  books.forEach(b => next.delete(b.id))
                  return next
                })
              } else {
                setSelected(prev => {
                  const next = new Set(prev)
                  books.forEach(b => next.add(b.id))
                  return next
                })
              }
            }
            return (
              <button onClick={toggleAll}
                title={allOnPage ? '取消全选本页' : '全选本页（Ctrl+A）'}
                className="btn flex items-center gap-1.5 text-sm">
                {allOnPage ? <CheckSquare size={14} /> : <Square size={14} />}
                {allOnPage ? '取消全选' : '全选'}
              </button>
            )
          })()}

          <div className="flex items-center rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <button onClick={() => setView('grid')} title="卡片视图"
              className="p-2 transition-colors"
              style={{ background: view === 'grid' ? 'var(--accent-soft)' : 'transparent',
                       color: view === 'grid' ? 'var(--accent)' : 'var(--text-muted)' }}>
              <LayoutGrid size={16} />
            </button>
            <button onClick={() => setView('list')} title="列表视图"
              className="p-2 transition-colors"
              style={{ background: view === 'list' ? 'var(--accent-soft)' : 'transparent',
                       color: view === 'list' ? 'var(--accent)' : 'var(--text-muted)' }}>
              <List size={16} />
            </button>
          </div>

          <div className="relative">
            <button onClick={() => setBatchOpen(v => !v)} className="btn flex items-center gap-1.5">
              批量处理{selectMode ? ` (${selected.size})` : ''} <ChevronDown size={14} />
            </button>
            {batchOpen && (
              <div
                className="absolute right-0 top-full mt-1 rounded-lg border py-1 z-10 w-56 shadow-xl"
                style={{ background: 'var(--bg-panel)', borderColor: 'var(--border)' }}
                onMouseLeave={() => setBatchOpen(false)}
              >
                <BatchItem icon={<Sparkles size={14} />} label={selectMode ? '生成摘要（选中）' : '生成摘要（缺失）'}
                  onClick={() => runBatch('summary')} />
                <BatchItem icon={<Tag size={14} />} label={selectMode ? '自动分类（选中）' : '自动分类（未分类）'}
                  onClick={() => runBatch('classify')} />
                <BatchItem icon={<Tag size={14} />} label={selectMode ? 'AI 打标签（选中）' : 'AI 打标签（未打标签）'}
                  onClick={() => runBatch('auto_tag')} />
                <BatchItem icon={<Hash size={14} />} label={selectMode ? '向量化（选中）' : '向量化（未处理）'}
                  onClick={() => runBatch('embed')} />
                <BatchItem icon={<BookMarked size={14} />} label={selectMode ? '全文索引（选中）' : '全文索引（未索引）'}
                  onClick={() => runBatch('index')} />
                {selectMode && <>
                  <div className="border-t my-1" style={{ borderColor: 'var(--border)' }} />
                  <BatchItem icon={<Pencil size={14} />} label="修改书籍信息（选中）" onClick={() => { setBatchOpen(false); setMetaModalOpen(true) }} />
                  <BatchItem icon={<Tag size={14} />} label="设置分类（选中）" onClick={() => { setBatchOpen(false); setCatModalOpen(true) }} />
                  <BatchItem icon={<Tag size={14} />} label="批量添加标签" onClick={bulkAddTag} />
                  <BatchItem icon={<Trash2 size={14} />} label={`移除 ${selected.size} 本`} onClick={bulkDelete} danger />
                </>}
              </div>
            )}
          </div>

          <button onClick={loadBooks} className="btn p-2"><RefreshCw size={16} /></button>
          <button onClick={() => setShowScan(true)} className="btn-primary flex items-center gap-2">
            <FolderOpen size={16} /> 扫描
          </button>
        </div>

        {selectMode && (
          <div className="mx-6 mt-3 rounded-lg px-4 py-2 text-sm flex items-center justify-between"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}>
            <span>已选择 {selected.size} 本 · Shift+点击范围选择 · Ctrl+A 全选 · Esc 取消</span>
            <button onClick={() => setSelected(new Set())}><X size={14} /></button>
          </div>
        )}

        {batchResult && (
          <div className="mx-6 mt-3 rounded-lg px-4 py-2 text-sm flex items-center justify-between"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}>
            <span>
              批量{({summary:'摘要',classify:'分类',auto_tag:'AI 打标签',embed:'向量化',index:'全文索引'})[batchResult.action] || batchResult.action}完成：
              成功 {batchResult.ok} / {batchResult.total}
              {batchResult.failed ? `，失败 ${batchResult.failed}` : ''}
            </span>
            <button onClick={() => setBatchResult(null)}><X size={14} /></button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {Array.from({ length: 12 }).map((_, i) => <BookCardSkeleton key={i} />)}
            </div>
          ) : books.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted gap-3">
              <p className="text-lg">书架空空如也</p>
              <p className="text-sm text-faint">点击右上角「扫描」按钮添加电子书</p>
            </div>
          ) : view === 'list' ? (
            <div className="space-y-1.5">
              {books.map((book) => (
                <BookCard key={book.id} book={book} view="list"
                  selectable selected={selected.has(book.id)}
                  onToggleSelect={toggleSelect} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {books.map((book) => (
                <BookCard key={book.id} book={book} view="grid"
                  selectable selected={selected.has(book.id)}
                  onToggleSelect={toggleSelect} />
              ))}
            </div>
          )}

          {!query && totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-8">
              <button onClick={() => updateParams({ page: Math.max(1, page - 1) })} disabled={page === 1} className="btn disabled:opacity-40">上一页</button>
              <span className="text-sm text-muted">{page} / {totalPages}</span>
              <button onClick={() => updateParams({ page: Math.min(totalPages, page + 1) })} disabled={page === totalPages} className="btn disabled:opacity-40">下一页</button>
            </div>
          )}
        </div>
      </div>

      {showScan && <ScanModal onClose={() => setShowScan(false)} onDone={() => { loadBooks(); loadCategories() }} />}
      {metaModalOpen && (
        <BulkMetaModal
          count={selected.size}
          books={books.filter(b => selected.has(b.id))}
          onApply={bulkApplyMeta}
          onClose={() => setMetaModalOpen(false)}
        />
      )}
      {catModalOpen && (
        <BulkCategoryModal
          count={selected.size}
          available={allCategories}
          existingFromCategories={categories.map(c => c.name)}
          onApply={bulkApplyCategory}
          onClose={() => setCatModalOpen(false)}
        />
      )}

    </div>
    </DropZone>
  )
}

function SideBtn({ active, onClick, children, noIndent }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-1.5 text-sm transition-colors truncate block"
      style={{
        color: active ? 'var(--accent)' : 'var(--text-muted)',
        background: active ? 'var(--bg-hover)' : 'transparent',
        fontWeight: active ? 600 : 400,
        paddingLeft: noIndent ? 0 : undefined,
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = 'var(--text)' }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = 'var(--text-muted)' }}
    >
      {children}
    </button>
  )
}

function FilterSection({ title, badge, children, storageKey, defaultOpen = false }) {
  const [open, setOpen] = useState(() => {
    if (!storageKey) return defaultOpen
    const saved = localStorage.getItem(storageKey)
    return saved == null ? defaultOpen : saved === '1'
  })
  function toggle() {
    const next = !open
    setOpen(next)
    if (storageKey) localStorage.setItem(storageKey, next ? '1' : '0')
  }
  return (
    <div className="border-b py-2" style={{ borderColor: 'var(--border)' }}>
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-faint hover:opacity-80"
      >
        <span className="flex items-center gap-1.5">
          <ChevronRight
            size={12}
            style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
          />
          {title}
          {badge > 0 && (
            <span className="text-[10px] px-1.5 rounded-full"
                  style={{ background: 'var(--accent)', color: 'white' }}>
              {badge}
            </span>
          )}
        </span>
      </button>
      {open && <div className="mt-1">{children}</div>}
    </div>
  )
}

const META_FIELDS = [
  { value: 'author', label: '作者' },
  { value: 'publisher', label: '出版社' },
  { value: 'publish_date', label: '出版日期' },
  { value: 'language', label: '语言' },
  { value: 'title', label: '书名' },
]

function BulkMetaModal({ count, books, onApply, onClose }) {
  const [field, setField] = useState('author')
  const [value, setValue] = useState('')
  const [onlyEmpty, setOnlyEmpty] = useState(false)

  // distinct existing values for the current field, for quick picking
  const existing = Array.from(new Set(books.map(b => b[field]).filter(Boolean))).sort()
  const emptyCount = books.filter(b => !b[field]).length
  const targetCount = onlyEmpty ? emptyCount : count
  const fieldLabel = META_FIELDS.find(f => f.value === field)?.label

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="card rounded-xl p-5 w-[420px] max-w-[90vw] border" style={{ borderColor: 'var(--border)' }} onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-semibold mb-1">批量修改书籍信息</h3>
        <p className="text-xs text-faint mb-4">将对已选中的 {count} 本书生效</p>

        <label className="text-xs text-faint block mb-1">字段</label>
        <div className="grid grid-cols-3 gap-1.5 mb-4">
          {META_FIELDS.map(f => (
            <button key={f.value} onClick={() => { setField(f.value); setValue('') }}
              className="text-xs py-1.5 rounded-lg border transition-colors"
              style={{
                background: field === f.value ? 'var(--accent-soft)' : 'transparent',
                borderColor: field === f.value ? 'var(--accent)' : 'var(--border)',
                color: field === f.value ? 'var(--accent)' : 'var(--text)',
              }}>
              {f.label}
            </button>
          ))}
        </div>

        <label className="text-xs text-faint block mb-1">新值</label>
        <input
          autoFocus value={value} onChange={(e) => setValue(e.target.value)}
          list="bulk-meta-options"
          className="input-themed w-full mb-2"
          placeholder={`输入新的${fieldLabel}（留空清除该字段）`}
          onKeyDown={(e) => { if (e.key === 'Enter') onApply({ field, value, onlyEmpty }) }}
        />
        <datalist id="bulk-meta-options">
          {existing.map(v => <option key={v} value={v} />)}
        </datalist>

        {existing.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3 max-h-20 overflow-y-auto">
            {existing.slice(0, 12).map(v => (
              <button key={v} onClick={() => setValue(v)}
                className="chip-gray text-[11px] hover:opacity-80 truncate max-w-[180px]"
                style={{ background: value === v ? 'var(--accent-soft)' : undefined, color: value === v ? 'var(--accent)' : undefined }}
                title={v}>
                {v}
              </button>
            ))}
          </div>
        )}

        <label className="flex items-start gap-2 p-2 mb-4 rounded-lg border cursor-pointer"
          style={{ borderColor: 'var(--border)' }}>
          <input type="checkbox" checked={onlyEmpty} onChange={(e) => setOnlyEmpty(e.target.checked)} className="mt-1" />
          <div>
            <div className="text-sm">仅填充空白项</div>
            <div className="text-xs text-faint">当前选中 {emptyCount} 本该字段为空</div>
          </div>
        </label>

        <div className="text-xs text-faint mb-3">
          将影响 <span className="font-semibold" style={{ color: 'var(--accent)' }}>{targetCount}</span> 本书
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn text-sm">取消</button>
          <button onClick={() => onApply({ field, value, onlyEmpty })}
            disabled={targetCount === 0}
            className="btn-primary text-sm disabled:opacity-50">
            确定
          </button>
        </div>
      </div>
    </div>
  )
}

function BulkCategoryModal({ count, available, existingFromCategories, onApply, onClose }) {
  const [name, setName] = useState('')
  const [mode, setMode] = useState('add')
  // merge + dedupe available (configured) + existing (currently used in library)
  const options = Array.from(new Set([...(available || []), ...(existingFromCategories || [])])).filter(Boolean).sort()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="card rounded-xl p-5 w-96 max-w-[90vw] border" style={{ borderColor: 'var(--border)' }} onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-semibold mb-1">批量设置分类</h3>
        <p className="text-xs text-faint mb-4">将对已选中的 {count} 本书生效</p>

        <label className="text-xs text-faint block mb-1">分类名称</label>
        <input
          autoFocus value={name} onChange={(e) => setName(e.target.value)}
          list="bulk-cat-options"
          className="input-themed w-full mb-3"
          placeholder="输入或选择分类"
          onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) onApply({ name, mode }) }}
        />
        <datalist id="bulk-cat-options">
          {options.map(c => <option key={c} value={c} />)}
        </datalist>

        {options.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {options.slice(0, 20).map(c => (
              <button key={c} onClick={() => setName(c)}
                className="chip-gray text-xs hover:opacity-80"
                style={{ background: name === c ? 'var(--accent-soft)' : undefined, color: name === c ? 'var(--accent)' : undefined }}>
                {c}
              </button>
            ))}
          </div>
        )}

        <div className="space-y-1.5 mb-4">
          <ModeRadio checked={mode === 'add'} onChange={() => setMode('add')}
            label="追加" desc="保留原有分类，加入新分类" />
          <ModeRadio checked={mode === 'replace'} onChange={() => setMode('replace')}
            label="替换" desc="清空原有分类，只保留新分类" />
          <ModeRadio checked={mode === 'remove'} onChange={() => setMode('remove')}
            label="移除" desc="从选中书籍的分类中删除" />
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn text-sm">取消</button>
          <button onClick={() => onApply({ name, mode })} disabled={!name.trim()}
            className="btn-primary text-sm disabled:opacity-50">确定</button>
        </div>
      </div>
    </div>
  )
}

function ModeRadio({ checked, onChange, label, desc }) {
  return (
    <label className="flex items-start gap-2 p-2 rounded-lg cursor-pointer border transition-colors"
      style={{ borderColor: checked ? 'var(--accent)' : 'var(--border)', background: checked ? 'var(--accent-soft)' : 'transparent' }}>
      <input type="radio" checked={checked} onChange={onChange} className="mt-1" />
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-faint">{desc}</div>
      </div>
    </label>
  )
}

function BatchItem({ icon, label, busy, onClick, danger }) {
  return (
    <button onClick={onClick} disabled={busy}
      className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm transition-colors disabled:opacity-50"
      style={{ color: danger ? 'var(--danger)' : 'var(--text)' }}
      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : icon}
      {label}
    </button>
  )
}
