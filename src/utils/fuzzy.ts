/** Subsequence fuzzy match returning a score (higher = better) or -1 for no match. */
export function fuzzyScore(query: string, text: string): number {
  if (!query) return 0
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  let qi = 0
  let score = 0
  let streak = 0
  let prevIndex = -1
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      streak = prevIndex === ti - 1 ? streak + 1 : 1
      score += 10 + streak * 5 + (ti === 0 || /[\s/_-]/.test(t[ti - 1]) ? 15 : 0)
      prevIndex = ti
      qi++
    }
  }
  return qi === q.length ? score - t.length * 0.1 : -1
}

export function fuzzyFilter<T>(query: string, items: T[], keyFn: (item: T) => string): T[] {
  if (!query.trim()) return items
  return items
    .map((item) => ({ item, score: fuzzyScore(query, keyFn(item)) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.item)
}
