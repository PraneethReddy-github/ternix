/** noVNC reports connection failures only as console lines; these turn one into pane text. */

const FAILURE_LINE = /^(?:Failed when connecting|Failed while connected|Failed when disconnecting|RFB failure): (.+)$/

/** The reason out of a noVNC `Log.Error` line, or null if it isn't one. */
export function parseRfbFailure(line: string): string | null {
  return FAILURE_LINE.exec(line)?.[1] ?? null
}

/**
 * RFB security types (1 byte) and VeNCrypt subtypes (4 bytes, hence >255). noVNC reuses one
 * "Unsupported security types" message for both lists, so a bare number like 262 is otherwise
 * unreadable — 262 is VeNCrypt X509Plain, nothing to do with security type 5.
 */
const SECURITY_TYPES: Record<number, string> = {
  1: 'None',
  2: 'VncAuth',
  5: 'RealVNC RSA-AES, encrypted',
  6: 'RealVNC RSA-AES',
  16: 'Tight',
  17: 'UltraVNC',
  18: 'TLS',
  19: 'VeNCrypt',
  20: 'SASL',
  22: 'xvp',
  30: 'Apple ARD',
  113: 'MS-Logon II',
  129: 'RealVNC RSA-AES-256, encrypted',
  130: 'RealVNC RSA-AES-256',
  256: 'VeNCrypt Plain',
  257: 'VeNCrypt TLSNone',
  258: 'VeNCrypt TLSVnc',
  259: 'VeNCrypt TLSPlain',
  260: 'VeNCrypt X509None',
  261: 'VeNCrypt X509Vnc',
  262: 'VeNCrypt X509Plain',
  263: 'VeNCrypt TLSSASL',
  264: 'VeNCrypt X509SASL'
}

/**
 * VeNCrypt subtypes that wrap the session in *anonymous* TLS. The bridge negotiates the X509
 * ones (260-262) itself, so only these can still dead-end: anonymous DH authenticates nothing,
 * leaving no certificate to pin.
 */
const ANON_TLS_SUBTYPES = new Set([257, 258, 259])

const NATIVE = 'Use “Open in native client” to connect with your system VNC viewer instead.'

/**
 * noVNC speaks classic VNC auth, VeNCrypt Plain, ARD, MS-Logon and RealVNC's *unencrypted*
 * RSA-AES. Servers offering only TLS-wrapped or encrypted schemes dead-end, and the raw
 * number list doesn't say which — name them, and say what to change on the server.
 */
export function explainVncFailure(reason: string): string {
  const match = /^Unsupported security types \(types: (.*)\)$/.exec(reason)
  if (!match) return reason
  const types = match[1]
    .split(',')
    .map((n) => Number(n.trim()))
    .filter((n) => Number.isInteger(n) && n > 0)
  if (!types.length) return reason

  const named = types.map((t) => `${t} (${SECURITY_TYPES[t] ?? 'unknown'})`).join(', ')
  const head = `This server only offers authentication the built-in viewer can't speak: ${named}.`

  if (types.every((t) => ANON_TLS_SUBTYPES.has(t))) {
    return `${head}\n\nThese wrap the session in anonymous TLS, which proves nothing about who answered — Ternix won't bridge that. Give the VNC server a certificate so it offers an X509 subtype (wayvnc: certificate_file and private_key_file), which does work here. Otherwise: ${NATIVE}`
  }
  if (types.some((t) => t === 5 || t === 129)) {
    return `${head}\n\nRealVNC Server's encrypted default (what Raspberry Pi OS ships) is the usual cause — set Authentication=VncAuth and Encryption=PreferOff on the server. Otherwise: ${NATIVE}`
  }
  return `${head}\n\n${NATIVE}`
}
