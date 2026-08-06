
function channels(hex: string): [number, number, number] | null {
  const h = hex.trim().replace(/^#/, '')
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h
  if (!/^[0-9a-f]{6}$/i.test(full.slice(0, 6)) || full.length < 6) return null
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)]
}

export function blendHex(color: string, base: string, ratio: number): string {
  const a = channels(color)
  const b = channels(base)
  if (!a || !b) return color
  const r = Math.min(1, Math.max(0, ratio))
  const mix = (x: number, y: number) => Math.round(x * r + y * (1 - r)).toString(16).padStart(2, '0')
  return `#${mix(a[0], b[0])}${mix(a[1], b[1])}${mix(a[2], b[2])}`
}
