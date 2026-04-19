import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import ForceGraph2D from 'react-force-graph-2d'
import { Wand2, Maximize2, Eye, EyeOff } from 'lucide-react'
import { getGraph } from '../api'

const CATEGORY_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#6366f1',
]

const LINK_TYPES = {
  same_author: { label: '同作者', color: '#60a5fa' },
  same_category: { label: '同分类', color: '#34d399' },
}

export default function Graph() {
  const [raw, setRaw] = useState({ nodes: [], links: [] })
  const [loading, setLoading] = useState(true)
  const [hovered, setHovered] = useState(null)
  const [catColors, setCatColors] = useState({})
  const [catCounts, setCatCounts] = useState({})
  const [hiddenCats, setHiddenCats] = useState(() => new Set())
  const [hiddenLinkTypes, setHiddenLinkTypes] = useState(() => new Set())
  const fgRef = useRef()
  const navigate = useNavigate()

  useEffect(() => {
    getGraph().then(({ data }) => {
      const cats = [...new Set(data.nodes.map(n => n.category))]
      const colors = {}, counts = {}
      cats.forEach((c, i) => { colors[c] = CATEGORY_COLORS[i % CATEGORY_COLORS.length] })
      data.nodes.forEach(n => { counts[n.category] = (counts[n.category] || 0) + 1 })
      setCatColors(colors); setCatCounts(counts)
      setRaw({
        nodes: data.nodes.map(n => ({ ...n, color: colors[n.category] || '#6b7280' })),
        links: data.edges.map(e => ({
          source: e.source, target: e.target, type: e.type, label: e.label,
          color: (LINK_TYPES[e.type]?.color || '#6b7280') + '66',
        })),
      })
      setLoading(false)
    })
  }, [])

  // Filtered view
  const graphData = useMemo(() => {
    const nodes = raw.nodes.filter(n => !hiddenCats.has(n.category))
    const ids = new Set(nodes.map(n => n.id))
    const links = raw.links.filter(l => {
      if (hiddenLinkTypes.has(l.type)) return false
      const s = typeof l.source === 'object' ? l.source.id : l.source
      const t = typeof l.target === 'object' ? l.target.id : l.target
      return ids.has(s) && ids.has(t)
    })
    return { nodes, links }
  }, [raw, hiddenCats, hiddenLinkTypes])

  function toggleCat(cat) {
    setHiddenCats(prev => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }
  function toggleLinkType(type) {
    setHiddenLinkTypes(prev => {
      const next = new Set(prev)
      next.has(type) ? next.delete(type) : next.add(type)
      return next
    })
  }
  function showAll() { setHiddenCats(new Set()); setHiddenLinkTypes(new Set()) }

  function autoLayout() {
    const fg = fgRef.current
    if (!fg) return
    // tune forces for a cleaner layout
    fg.d3Force('charge')?.strength(-180)
    fg.d3Force('link')?.distance(60)
    fg.d3ReheatSimulation()
    setTimeout(() => fg.zoomToFit(800, 60), 1200)
  }

  function fitView() { fgRef.current?.zoomToFit(600, 60) }

  const nodeCanvasObject = useCallback((node, ctx, globalScale) => {
    const r = 6
    ctx.beginPath()
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
    ctx.fillStyle = node.color || '#6b7280'
    ctx.fill()
    ctx.strokeStyle = hovered?.id === node.id ? '#fff' : 'transparent'
    ctx.lineWidth = 1.5
    ctx.stroke()

    if (globalScale > 1.5 || hovered?.id === node.id) {
      const label = node.title.length > 12 ? node.title.slice(0, 12) + '…' : node.title
      ctx.font = `${10 / globalScale}px sans-serif`
      ctx.fillStyle = '#e5e7eb'
      ctx.textAlign = 'center'
      ctx.fillText(label, node.x, node.y + r + 8 / globalScale)
    }
  }, [hovered])

  if (loading) return <div className="flex items-center justify-center h-full text-gray-400">加载图谱中...</div>

  if (raw.nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-2">
        <p className="text-lg">暂无数据</p>
        <p className="text-sm">请先扫描书籍并进行自动分类，再查看知识图谱</p>
      </div>
    )
  }

  const sortedCats = Object.entries(catColors).sort((a, b) => (catCounts[b[0]] || 0) - (catCounts[a[0]] || 0))
  const anyHidden = hiddenCats.size > 0 || hiddenLinkTypes.size > 0

  return (
    <div className="relative h-full bg-gray-950">
      {/* Toolbar */}
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <button onClick={autoLayout}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-900/90 border border-gray-700 text-gray-200 hover:bg-gray-800 transition-colors"
          title="重新计算力导向布局">
          <Wand2 size={13} /> 自动布局
        </button>
        <button onClick={fitView}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-900/90 border border-gray-700 text-gray-200 hover:bg-gray-800 transition-colors"
          title="缩放至适合窗口">
          <Maximize2 size={13} /> 适应屏幕
        </button>
      </div>

      {/* Legend with filters */}
      <div className="absolute top-4 left-4 z-10 bg-gray-900/90 rounded-xl p-3 border border-gray-800 text-xs max-w-[220px] max-h-[calc(100%-2rem)] overflow-y-auto">
        <div className="flex items-center justify-between mb-2">
          <p className="text-gray-400 font-semibold">图例 · 筛选</p>
          {anyHidden && (
            <button onClick={showAll} className="text-[10px] text-blue-300 hover:text-blue-200">显示全部</button>
          )}
        </div>

        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">分类 · 点击隐藏</p>
        <div className="space-y-1 mb-3">
          {sortedCats.map(([cat, color]) => {
            const hidden = hiddenCats.has(cat)
            return (
              <button key={cat} onClick={() => toggleCat(cat)}
                className="w-full flex items-center gap-2 text-left py-0.5 px-1 rounded hover:bg-gray-800 transition-colors"
                style={{ opacity: hidden ? 0.4 : 1 }}>
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span className="text-gray-300 truncate flex-1" style={{ textDecoration: hidden ? 'line-through' : 'none' }}>
                  {cat || '未分类'}
                </span>
                <span className="text-gray-500 text-[10px]">{catCounts[cat] || 0}</span>
                {hidden ? <EyeOff size={10} className="text-gray-500 shrink-0" /> : <Eye size={10} className="text-gray-600 shrink-0" />}
              </button>
            )
          })}
        </div>

        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">关系 · 点击隐藏</p>
        <div className="space-y-1">
          {Object.entries(LINK_TYPES).map(([type, { label, color }]) => {
            const hidden = hiddenLinkTypes.has(type)
            return (
              <button key={type} onClick={() => toggleLinkType(type)}
                className="w-full flex items-center gap-2 text-left py-0.5 px-1 rounded hover:bg-gray-800 transition-colors"
                style={{ opacity: hidden ? 0.4 : 1 }}>
                <span className="w-6 h-0.5 shrink-0" style={{ backgroundColor: color }} />
                <span className="text-gray-300 flex-1" style={{ textDecoration: hidden ? 'line-through' : 'none' }}>
                  {label}
                </span>
                {hidden ? <EyeOff size={10} className="text-gray-500" /> : <Eye size={10} className="text-gray-600" />}
              </button>
            )
          })}
        </div>

        <p className="text-[10px] text-gray-500 mt-3 pt-2 border-t border-gray-800">
          显示节点 {graphData.nodes.length} / {raw.nodes.length}
        </p>
      </div>

      {/* Hover tooltip */}
      {hovered && (
        <div className="absolute bottom-4 right-4 z-10 bg-gray-900/95 rounded-xl p-4 border border-gray-700 max-w-xs">
          <p className="font-semibold text-gray-100 text-sm leading-snug">{hovered.title}</p>
          <p className="text-gray-400 text-xs mt-1">{hovered.author}</p>
          <span className="text-xs px-2 py-0.5 rounded-full mt-2 inline-block" style={{ backgroundColor: hovered.color + '33', color: hovered.color }}>
            {hovered.category}
          </span>
          <p className="text-gray-500 text-xs mt-2">点击查看详情</p>
        </div>
      )}

      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        nodeCanvasObject={nodeCanvasObject}
        nodePointerAreaPaint={(node, color, ctx) => {
          ctx.fillStyle = color
          ctx.beginPath()
          ctx.arc(node.x, node.y, 10, 0, 2 * Math.PI)
          ctx.fill()
        }}
        linkColor={(link) => link.color}
        linkWidth={1}
        backgroundColor="#030712"
        onNodeHover={setHovered}
        onNodeClick={(node) => navigate(`/books/${node.id}`)}
        cooldownTicks={100}
        nodeRelSize={6}
      />
    </div>
  )
}
