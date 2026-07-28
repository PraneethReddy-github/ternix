import nacl from 'tweetnacl'

/**
 * Payload encryption for the phone link.
 *
 * Every WebSocket frame in both directions is sealed with XSalsa20-Poly1305 under a
 * key that only the two endpoints hold, so the transport underneath (plain ws:// on a
 * LAN, or wss:// relayed by Cloudflare) never carries readable terminal traffic.
 *
 * The phone cannot use WebCrypto for this: `crypto.subtle` is undefined on non-secure
 * origins, and a LAN address is never a secure origin. Hence tweetnacl on both ends —
 * the same primitives run in the browser and here, so there is one thing to get right
 * instead of two.
 */

/** Random 24-byte nonces: at that width, collisions are not a thing worth counting. */
const NONCE = nacl.secretbox.nonceLength

export const b64 = (b: Uint8Array): string => Buffer.from(b).toString('base64')
export const unb64 = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, 'base64'))

/**
 * The pairing secret as a secretbox key. It is already 32 uniformly random bytes, just
 * spelled base64url so it survives a trip through a URL fragment — no KDF needed to turn
 * full-entropy bytes into full-entropy bytes.
 */
export const pairKey = (secret: string): Uint8Array => new Uint8Array(Buffer.from(secret, 'base64url'))

/** Seal a JSON-able value. Returns `nonce.ciphertext`, both base64. */
export function seal(value: unknown, key: Uint8Array): string {
  const nonce = nacl.randomBytes(NONCE)
  const box = nacl.secretbox(new TextEncoder().encode(JSON.stringify(value)), nonce, key)
  return `${b64(nonce)}.${b64(box)}`
}

/** Open a sealed frame. Returns null on any tampering, wrong key, or malformed input. */
export function open<T = any>(frame: string, key: Uint8Array): T | null {
  const dot = frame.indexOf('.')
  if (dot < 0) return null
  try {
    const nonce = unb64(frame.slice(0, dot))
    const box = unb64(frame.slice(dot + 1))
    if (nonce.length !== NONCE) return null
    const plain = nacl.secretbox.open(box, nonce, key)
    if (!plain) return null
    return JSON.parse(new TextDecoder().decode(plain)) as T
  } catch {
    return null
  }
}
