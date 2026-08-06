// Self-check for the hex blend behind the find-in-terminal highlight.
// Run: node --experimental-strip-types src/utils/blendHex.check.ts
import assert from 'node:assert/strict'
import { blendHex } from './blendHex.ts'

// ── The ends of the range are the inputs themselves ──────────────────────────────────────
{
  assert.equal(blendHex('#d29922', '#0d1117', 1), '#d29922', 'ratio 1 is all colour')
  assert.equal(blendHex('#d29922', '#0d1117', 0), '#0d1117', 'ratio 0 is all base')
}

// ── Halfway is halfway, per channel ──────────────────────────────────────────────────────
{
  assert.equal(blendHex('#ffffff', '#000000', 0.5), '#808080')
  assert.equal(blendHex('#ff0000', '#0000ff', 0.5), '#800080', 'channels mix independently')
}

// ── Which way it washes out depends on the base, which is the point ──────────────────────
// The same highlight has to sit on a dark pane and a light one; mixing toward the
// background is what makes a light theme get a pale wash instead of a muddy dark one.
{
  const onDark = blendHex('#d29922', '#0d1117', 0.35)
  const onLight = blendHex('#d29922', '#ffffff', 0.35)
  const lum = (h: string) =>
    parseInt(h.slice(1, 3), 16) + parseInt(h.slice(3, 5), 16) + parseInt(h.slice(5, 7), 16)
  assert.ok(lum(onDark) < lum('#d29922'), 'a dark pane darkens it')
  assert.ok(lum(onLight) > lum('#d29922'), 'a light pane lightens it')
}

// ── Always a valid 6-digit colour, whatever the ratio ────────────────────────────────────
{
  for (const r of [0, 0.01, 0.33, 0.5, 0.99, 1]) {
    const out = blendHex('#010203', '#fefdfc', r)
    assert.match(out, /^#[0-9a-f]{6}$/, `ratio ${r} must still produce #rrggbb — got ${out}`)
  }
  assert.equal(blendHex('#000000', '#ffffff', 0.5), '#808080', 'single-digit channels keep their zero padding')
}

// ── Shorthand and out-of-range input ─────────────────────────────────────────────────────
{
  assert.equal(blendHex('#fff', '#000', 1), '#ffffff', '#rgb expands')
  assert.equal(blendHex('#d29922', '#0d1117', 5), '#d29922', 'a ratio above 1 clamps')
  assert.equal(blendHex('#d29922', '#0d1117', -2), '#0d1117', 'a ratio below 0 clamps')
}

// ── A theme with a mistyped colour must not take the search box down with it ─────────────
{
  assert.equal(blendHex('not a colour', '#0d1117', 0.5), 'not a colour', 'unparseable colour passes through')
  assert.equal(blendHex('#d29922', 'rgb(1,2,3)', 0.5), '#d29922', 'unparseable base passes through')
  assert.equal(blendHex('#12345', '#0d1117', 0.5), '#12345', 'five digits is not a colour')
}

console.log('blendHex: all checks passed')
