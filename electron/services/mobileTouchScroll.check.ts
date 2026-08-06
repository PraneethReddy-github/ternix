// Self-check for the arithmetic behind the phone's drag-to-scroll gesture.
//
// Both halves are the kind of thing that fails silently rather than loudly: get the axis
// test wrong and a mirrored pane can no longer be panned sideways; drop the sub-line
// remainder and a slow drag rounds to zero on every move, so the terminal never budges
// however far the thumb travels.
//
// The functions are lifted out of the served page rather than copied, the same way
// mobileCrypto.interop.check.ts does, so this fails if the page drifts from them.
//
// Run: node --experimental-strip-types electron/services/mobileTouchScroll.check.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const html = readFileSync(join(here, '../../resources/mobile/index.html'), 'utf8')

const marker = (name: string) => {
  const at = html.indexOf(`// ------------------------------------------------------------ ${name}`)
  assert.ok(at > 0, `could not find the ${name} block in the phone client`)
  return at
}

// The block between these two markers is pure — no DOM, no xterm, nothing to stub.
const { dragAxis, scrollStep, DRAG_SLOP } = new Function(
  `${html.slice(marker('scroll math'), marker('scrollback'))}
   return { dragAxis: dragAxis, scrollStep: scrollStep, DRAG_SLOP: DRAG_SLOP };`
)() as {
  dragAxis: (dx: number, dy: number, slop: number) => 'x' | 'y' | null
  scrollStep: (movedPx: number, rest: number, lineHeight: number) => { lines: number; rest: number }
  DRAG_SLOP: number
}

const S = DRAG_SLOP

// ── A touch that has barely moved is not yet a drag ──────────────────────────────────────
{
  assert.equal(dragAxis(0, 0, S), null, 'a still finger has no direction')
  assert.equal(dragAxis(S - 1, S - 1, S), null, 'inside the slop it is still a tap')
  assert.equal(dragAxis(-(S - 1), S - 1, S), null, 'slop is about distance, not direction')
}

// ── Past the slop it commits, and a tie goes to panning ──────────────────────────────────
{
  assert.equal(dragAxis(2, S, S), 'y', 'a mostly-vertical drag scrolls')
  assert.equal(dragAxis(-2, -S, S), 'y', 'upward counts the same as downward')
  assert.equal(dragAxis(S, 2, S), 'x', 'a mostly-horizontal drag pans')
  assert.equal(dragAxis(S, S, S), 'x', 'a diagonal tie must pan — only a wide pane can pan at all')
}

// ── Whole lines out, remainder carried ───────────────────────────────────────────────────
{
  const h = 17
  assert.deepEqual(scrollStep(h * 3, 0, h), { lines: 3, rest: 0 }, 'exact multiples carry nothing')
  assert.deepEqual(scrollStep(0, 0, h), { lines: 0, rest: 0 })

  const s = scrollStep(20, 0, h)
  assert.equal(s.lines, 1, 'one line and a bit is one line')
  assert.equal(s.rest, 3, 'the bit is kept for next time')
}

// ── A slow drag must not round away to nothing ───────────────────────────────────────────
// This is the regression that matters: 5px at a time never reaches a 17px line on its own.
{
  const h = 17
  let rest = 0
  let scrolled = 0
  for (let i = 0; i < 12; i++) {
    const s = scrollStep(5, rest, h)
    rest = s.rest
    scrolled += s.lines
  }
  assert.equal(scrolled, Math.trunc((5 * 12) / h), '60px of slow dragging is 3 lines, not 0')
  assert.ok(Math.abs(rest) < h, 'the carry never grows past a line')
}

// ── Dragging back the other way undoes it exactly ────────────────────────────────────────
{
  const h = 16
  let rest = 0
  let net = 0
  for (const px of [7, 7, 7, -7, -7, -7]) {
    const s = scrollStep(px, rest, h)
    rest = s.rest
    net += s.lines
  }
  assert.equal(net, 0, 'a drag and its exact reverse must land back where it started')
  assert.equal(rest, 0)
}

// ── Upward drags mirror downward ones ────────────────────────────────────────────────────
{
  const h = 17
  const down = scrollStep(50, 0, h)
  const up = scrollStep(-50, 0, h)
  assert.equal(up.lines, -down.lines, 'the two directions must be symmetric')
  assert.equal(up.rest, -down.rest)
}

console.log('mobileTouchScroll: all checks passed')
