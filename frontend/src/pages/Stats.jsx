import { useEffect, useState } from 'react'
import { Book, HardDrive, Users, Sparkles, Tag, Hash } from 'lucide-react'
import { getStats } from '../api'

export default function Stats() {
  const [data, setData] = useState(null)

  useEffect(() => { getStats().then(({ data }) => setData(data)) }, [])

  if (!data) return <div className="p-8 text-muted">加载中...</div>

  const maxCat = Math.max(...data.category_distribution.map(c => c.count), 1)

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold mb-6">书库统计</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatCard icon={<Book size={18} />} label="书籍总数" value={data.total} />
        <StatCard icon={<HardDrive size={18} />} label="存储大小" value={`${data.total_size_mb} MB`} />
        <StatCard icon={<Users size={18} />} label="作者数" value={data.authors} />
        <StatCard icon={<Book size={18} />} label="PDF / EPUB" value={`${data.pdf} / ${data.epub}`} />
      </div>

      {/* AI 处理进度 */}
      <section className="card rounded-xl p-5 border mb-8">
        <h2 className="text-sm font-semibold mb-4">AI 处理进度</h2>
        <ProgressBar icon={<Sparkles size={14} />} label="已生成摘要" value={data.with_summary} total={data.total} />
        <ProgressBar icon={<Tag size={14} />} label="已自动分类" value={data.with_categories} total={data.total} />
        <ProgressBar icon={<Hash size={14} />} label="已向量化（可语义搜索）" value={data.embedded} total={data.total} />
      </section>

      {/* 分类分布 */}
      {data.category_distribution.length > 0 && (
        <section className="card rounded-xl p-5 border">
          <h2 className="text-sm font-semibold mb-4">分类分布</h2>
          <div className="space-y-2">
            {data.category_distribution.map((c) => (
              <div key={c.name} className="flex items-center gap-3 text-sm">
                <span className="w-20 shrink-0 text-muted">{c.name}</span>
                <div
                  className="flex-1 h-6 rounded-md relative overflow-hidden"
                  style={{ background: 'var(--bg-hover)' }}
                >
                  <div
                    className="h-full rounded-md transition-all"
                    style={{
                      width: `${(c.count / maxCat) * 100}%`,
                      background: 'var(--accent)',
                    }}
                  />
                </div>
                <span className="w-8 text-right text-muted">{c.count}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function StatCard({ icon, label, value }) {
  return (
    <div className="card rounded-xl p-4 border">
      <div className="flex items-center gap-2 text-muted text-xs mb-1">
        {icon} {label}
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  )
}

function ProgressBar({ icon, label, value, total }) {
  const pct = total ? (value / total) * 100 : 0
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="flex items-center gap-1.5 text-muted">{icon} {label}</span>
        <span className="text-muted">{value} / {total}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-hover)' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: 'var(--accent)' }}
        />
      </div>
    </div>
  )
}
