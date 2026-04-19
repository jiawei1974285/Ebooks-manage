import { useState, useRef, useEffect } from 'react'
import { Send, Loader2, BookOpen, FileText, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { chat } from '../api'

export default function Chat() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: '你好！我是书库 AI 助手。开启 RAG 模式后，我会基于你索引过的书籍原文来回答问题并标注来源。' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [relatedBooks, setRelatedBooks] = useState([])
  const [useRag, setUseRag] = useState(true)
  const bottomRef = useRef()
  const navigate = useNavigate()

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function handleSend() {
    const q = input.trim()
    if (!q || loading) return
    setInput('')
    setMessages(m => [...m, { role: 'user', content: q }])
    setLoading(true)
    try {
      const { data } = await chat(q, { mode: useRag ? 'rag' : 'summary' })
      setMessages(m => [...m, {
        role: 'assistant',
        content: data.answer,
        sources: data.sources || [],
        used_rag: data.used_rag,
      }])
      setRelatedBooks(data.related_books || [])
    } catch (e) {
      setMessages(m => [...m, { role: 'assistant', content: '抱歉，出现错误：' + (e.response?.data?.detail || e.message) }])
    } finally { setLoading(false) }
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between px-6 py-3 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2 text-sm">
            <Sparkles size={14} style={{ color: 'var(--accent)' }} />
            <span className="font-medium">AI 问书</span>
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={useRag} onChange={(e) => setUseRag(e.target.checked)} />
            <span>RAG 模式（基于全文索引）</span>
          </label>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-2xl space-y-2">
                <div
                  className="px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap"
                  style={{
                    background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-card)',
                    color: msg.role === 'user' ? 'white' : 'var(--text)',
                    border: msg.role === 'user' ? 'none' : '1px solid var(--border)',
                    borderBottomRightRadius: msg.role === 'user' ? 4 : undefined,
                    borderBottomLeftRadius: msg.role === 'assistant' ? 4 : undefined,
                  }}
                >
                  {msg.content}
                </div>
                {msg.sources?.length > 0 && (
                  <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: 'var(--border)', background: 'var(--bg-panel)' }}>
                    <p className="text-[11px] font-semibold text-faint uppercase tracking-wider flex items-center gap-1">
                      <FileText size={10} /> 参考来源 ({msg.sources.length})
                    </p>
                    {msg.sources.map((s) => (
                      <div key={s.idx} onClick={() => navigate(`/books/${s.book_id}`)}
                        className="text-xs p-2 rounded-lg cursor-pointer transition-colors"
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        <p className="font-medium">
                          <span style={{ color: 'var(--accent)' }}>[{s.idx}]</span>《{s.title}》
                          <span className="text-faint ml-1">第 {s.page} 页</span>
                        </p>
                        <p className="text-faint mt-1 line-clamp-2">{s.snippet}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="card border rounded-2xl px-4 py-3"><Loader2 size={16} className="animate-spin" style={{ color: 'var(--accent)' }} /></div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="border-t px-6 py-4" style={{ borderColor: 'var(--border)' }}>
          <div className="flex gap-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              placeholder={useRag ? 'RAG 模式：基于书中原文回答...' : '问我任何关于书库的问题...'}
              className="input-themed flex-1"
            />
            <button onClick={handleSend} disabled={loading || !input.trim()} className="btn-primary px-4 disabled:opacity-50">
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>

      {relatedBooks.length > 0 && (
        <aside className="w-56 border-l p-4 overflow-y-auto shrink-0" style={{ background: 'var(--bg-panel)', borderColor: 'var(--border)' }}>
          <p className="text-xs font-semibold text-faint uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <BookOpen size={12} /> 相关书籍
          </p>
          <div className="space-y-3">
            {relatedBooks.map((book) => (
              <div key={book.id} onClick={() => navigate(`/books/${book.id}`)}
                className="flex gap-2 cursor-pointer rounded-lg p-2 transition-colors"
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={(e) => e.currentTarget.style.background = ''}
              >
                <div className="w-8 h-11 rounded overflow-hidden shrink-0" style={{ background: 'var(--bg-hover)' }}>
                  {book.cover_url
                    ? <img src={book.cover_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                    : <div className="w-full h-full flex items-center justify-center text-faint text-[8px] font-bold">{book.file_format}</div>}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium leading-tight line-clamp-2">{book.title}</p>
                  <p className="text-[10px] text-faint truncate mt-0.5">{book.author}</p>
                </div>
              </div>
            ))}
          </div>
        </aside>
      )}
    </div>
  )
}
