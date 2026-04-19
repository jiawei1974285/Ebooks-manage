// Group books that share the same normalized title (+ author) but differ in format.
// Used by Library to collapse duplicates into a single card, and by BookDetail
// to show sibling-format links.

export function normalizeTitle(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .replace(/[\p{P}\p{S}]/gu, '')  // strip punctuation / symbols
    .trim()
}

export function groupKey(book) {
  const t = normalizeTitle(book.title)
  const a = normalizeTitle(book.author)
  return `${t}|${a}`
}

// Rank helper: pick the most "processed" book as the group's primary card.
function scoreBook(b) {
  let s = 0
  if (b.mineru_parsed) s += 8
  if (b.indexed) s += 4
  if (b.embedding_done) s += 2
  if (b.summary) s += 1
  if (b.cover_url) s += 1
  if (b.file_format === 'PDF') s += 0.5  // mild tie-breaker
  return s
}

export function groupBooks(books) {
  const map = new Map()
  const order = []
  for (const b of books) {
    const key = groupKey(b)
    if (!map.has(key)) {
      map.set(key, { key, primary: b, members: [b] })
      order.push(key)
    } else {
      const g = map.get(key)
      g.members.push(b)
      if (scoreBook(b) > scoreBook(g.primary)) g.primary = b
    }
  }
  // Return groups with siblings = members minus primary
  return order.map(k => {
    const g = map.get(k)
    const siblings = g.members.filter(b => b.id !== g.primary.id)
    return { key: g.key, primary: g.primary, siblings, members: g.members }
  })
}

// Given a flat selection (set of primary ids) and the current groups, expand
// to include sibling ids so batch ops act on all formats of the selected book.
export function expandSelectionWithSiblings(selectedIds, groups) {
  const result = new Set()
  const byPrimary = new Map(groups.map(g => [g.primary.id, g]))
  for (const id of selectedIds) {
    const g = byPrimary.get(id)
    if (g) {
      for (const m of g.members) result.add(m.id)
    } else {
      result.add(id)
    }
  }
  return [...result]
}
