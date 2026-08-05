/**
 * VeNCrypt (RFB security type 19) constants, and the two decisions VncBridgeService has to
 * make about it. No I/O here so they can be checked without a socket.
 */

export const SEC_NONE = 1
export const SEC_VNC_AUTH = 2
export const SEC_VENCRYPT = 19
/** Not a 1-byte security type — VeNCrypt subtypes are 32-bit, hence the values above 255. */
export const SEC_PLAIN = 256

/**
 * Security types noVNC negotiates on its own, mirroring _isSupportedSecurityType in
 * @novnc/novnc/core/rfb.js. VeNCrypt is excluded on purpose: whether noVNC can finish it
 * depends on subtypes that only appear after someone commits to type 19.
 */
const NOVNC_TYPES = new Set([1, 2, 6, 16, 22, 30, 113])

/**
 * X.509 VeNCrypt subtypes, best first, paired with the authentication that runs *inside* the
 * TLS tunnel. The anonymous-DH subtypes (TLSNone/TLSVnc/TLSPlain, 257-259) are deliberately
 * absent: anonymous DH authenticates nothing, so there is no certificate to pin and no way
 * to tell the real server from a man in the middle. Those fall through to noVNC's own error.
 */
const X509_SUBTYPES: [subtype: number, inner: number][] = [
  [262, SEC_PLAIN], // X509Plain
  [261, SEC_VNC_AUTH], // X509Vnc
  [260, SEC_NONE] // X509None
]

/** True when noVNC would dead-end on this list and only VeNCrypt could rescue it. */
export function needsBridge(types: number[]): boolean {
  return types.includes(SEC_VENCRYPT) && !types.some((t) => NOVNC_TYPES.has(t))
}

/** The best X.509 subtype on offer, or null when none is worth taking over for. */
export function pickTlsSubtype(subtypes: number[]): number | null {
  return X509_SUBTYPES.find(([s]) => subtypes.includes(s))?.[0] ?? null
}

/** What runs inside the tunnel once `subtype`'s TLS handshake completes. */
export function innerAuth(subtype: number): number {
  const found = X509_SUBTYPES.find(([s]) => s === subtype)
  if (!found) throw new Error(`Not a bridged VeNCrypt subtype: ${subtype}`)
  return found[1]
}
