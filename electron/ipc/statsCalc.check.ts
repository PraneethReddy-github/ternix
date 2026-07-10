// Self-check for local-stats numeric conversions.
// Run: node --experimental-strip-types electron/ipc/statsCalc.check.ts
import assert from 'node:assert/strict'
import { kelvinTenthsToCelsius, cpuDeltaPercent } from './statsCalc.ts'

// 3000 tenths-K = 300.0 K = 26.85 °C → 26.9 rounded. Typical CPU ~50 °C = 3231.5 tenths-K.
assert.equal(kelvinTenthsToCelsius(3000), 26.9)
assert.equal(kelvinTenthsToCelsius(2731.5), 0) // 273.15 K = 0 °C
assert.equal(kelvinTenthsToCelsius(3231), 50) // ~50 °C

// A process burning one whole core over a 15 s window on an 8-core box = 1/8 = 12.5 %.
assert.equal(cpuDeltaPercent(15, 15, 8), 12.5)
// Two full cores over 2 s on 4 cores = 50 %.
assert.equal(cpuDeltaPercent(4, 2, 4), 50)
// Degenerate inputs never divide by zero or go negative.
assert.equal(cpuDeltaPercent(5, 0, 8), 0)
assert.equal(cpuDeltaPercent(5, 10, 0), 0)
assert.equal(cpuDeltaPercent(-1, 10, 8), 0)

console.log('statsCalc: all checks passed')
