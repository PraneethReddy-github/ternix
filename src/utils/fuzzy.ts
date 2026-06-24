/** Tokenized substring match returning a score (higher = better) or -1 for no match. */
export function fuzzyScore(query: string, text: string): number {
  if (!query) return 0
  const q = query.toLowerCase().trim()
  if (!q) return 0
  const t = text.toLowerCase()
  
  const tokens = q.split(/\s+/)
  let score = 0
  
  for (const token of tokens) {
    const idx = t.indexOf(token)
    if (idx === -1) return -1 // All tokens must be present
    
    // Base score for the token length
    score += token.length * 10
    
    // Bonus for matching at the beginning of the text or after a word boundary
    if (idx === 0) {
      score += 20
    } else if (/[\s/_-]/.test(t[idx - 1])) {
      score += 15
    }
  }
  
  return score
}

export function fuzzyFilter<T>(query: string, items: T[], keyFn: (item: T) => string): T[] {
  if (!query.trim()) return items
  return items
    .map((item) => ({ item, score: fuzzyScore(query, keyFn(item)) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.item)
}
