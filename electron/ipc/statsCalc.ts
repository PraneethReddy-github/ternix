// Pure numeric conversions for local system stats. Kept separate so they can be
// checked without spawning the platform commands that feed them.

/** ACPI thermal zones (Windows MSAcpi_ThermalZoneTemperature) report tenths of a Kelvin. */
export function kelvinTenthsToCelsius(tenthsK: number): number {
  return Math.round((tenthsK / 10 - 273.15) * 10) / 10
}

/**
 * Windows Get-Process reports cumulative CPU *seconds* per process, so instantaneous
 * %CPU is a delta between two samples: (CPU-seconds used ÷ wall-seconds elapsed) is the
 * number of cores' worth of work, normalised by core count to a percent of total capacity.
 */
export function cpuDeltaPercent(dCpuSec: number, dtSec: number, cores: number): number {
  if (dtSec <= 0 || cores <= 0) return 0
  const pct = (dCpuSec / dtSec) / cores * 100
  return pct > 0 ? Math.round(pct * 10) / 10 : 0
}
