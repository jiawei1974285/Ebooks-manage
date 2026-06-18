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
  // Group primarily by normalized title. Author differences (e.g. "李国文" vs
  // "李国文 & 姚雪垠 & ...") often reflect metadata inconsistency between the
  // PDF and EPUB versions of the *same* book, so we don't key on author here.
  // Disambiguation of genuinely-different books that share a title is handled
  // inside groupBooks via author-token overlap.
  return normalizeTitle(book.title)
}

// Split an author string into normalized tokens. Handles common separators
// (& , ，; ；、/ and whitespace).
function authorTokens(s) {
  const n = normalizeTitle(s)
  if (!n) return []
  return n.split(/[\s,;&/]+/).filter(Boolean)
}

// Two books with the same title belong to the same logical book when either
// side has no author, or their author-token sets share at least one token.
export function authorsCompatible(a, b) {
  const ta = authorTokens(a)
  const tb = authorTokens(b)
  if (ta.length === 0 || tb.length === 0) return true
  const sa = new Set(ta)
  return tb.some(t => sa.has(t))
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
  // Buckets keyed by normalized title; each bucket may contain multiple
  // author-incompatible sub-groups for edge cases like unrelated books
  // that happen to share a title.
  const buckets = new Map()  // key -> Array<{ primary, members }>
  const order = []           // preserves first-seen order across buckets

  for (const b of books) {
    const key = groupKey(b)
    if (!buckets.has(key)) {
      buckets.set(key, [])
      order.push(key)
    }
    const subs = buckets.get(key)
    // Find a compatible subgroup (shares ≥1 author token, or either side empty)
    const sub = subs.find(s => s.members.some(m => authorsCompatible(m.author, b.author)))
    if (sub) {
      sub.members.push(b)
      if (scoreBook(b) > scoreBook(sub.primary)) sub.primary = b
    } else {
      subs.push({ primary: b, members: [b] })
    }
  }

  const groups = []
  for (const key of order) {
    for (const g of buckets.get(key)) {
      const siblings = g.members.filter(b => b.id !== g.primary.id)
      groups.push({ key, primary: g.primary, siblings, members: g.members })
    }
  }
  return groups
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
