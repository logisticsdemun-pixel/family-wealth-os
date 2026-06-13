// Cryptographic primitives and in-memory data store for Grey Diary

const AUTH_KEY = 'fwos:auth'
const V2_PREFIX = 'fwos:v2:'
const PBKDF2_ITERATIONS = 200000

const ENCRYPTED_KEYS = [
  'fwos-investments', 'fwos-fixed-income', 'fwos-gold', 'fwos-gold-prices',
  'fwos-loans', 'fwos-insurance', 'fwos-cash-assets', 'fwos-liabilities',
  'fwos-price-cache', 'fwos-price-updated', 'fwos-snapshots', 'fwos-real-estate',
]

let _cryptoKey = null
let _memoryStore = {}

// ── Base64 / ArrayBuffer helpers ───────────────────────────
function ab2b64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}
function b642ab(b64) {
  const s = atob(b64)
  const a = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i)
  return a.buffer
}

// ── PBKDF2 ─────────────────────────────────────────────────
async function deriveKey(password, salt) {
  const enc = new TextEncoder()
  const mat = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    mat,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

async function pbkdf2Hash(password, salt) {
  const enc = new TextEncoder()
  const mat = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    mat,
    256
  )
  return ab2b64(bits)
}

// ── AES-GCM ─────────────────────────────────────────────────
async function encryptStr(key, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const enc = new TextEncoder()
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext))
  const out = new Uint8Array(12 + ct.byteLength)
  out.set(iv, 0)
  out.set(new Uint8Array(ct), 12)
  return ab2b64(out.buffer)
}

async function decryptStr(key, b64) {
  const buf = new Uint8Array(b642ab(b64))
  const iv = buf.slice(0, 12)
  const ct = buf.slice(12)
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
  return new TextDecoder().decode(pt)
}

// ── Internal helpers ────────────────────────────────────────
async function persistOne(key, value) {
  if (!_cryptoKey) return
  try {
    const ct = await encryptStr(_cryptoKey, JSON.stringify(value))
    localStorage.setItem(V2_PREFIX + key, ct)
  } catch {}
}

async function migrateV1() {
  // Move any unencrypted fwos-* keys to encrypted fwos:v2:* keys
  for (const key of ENCRYPTED_KEYS) {
    const old = localStorage.getItem(key)
    if (old !== null) {
      if (!localStorage.getItem(V2_PREFIX + key)) {
        try {
          const ct = await encryptStr(_cryptoKey, old) // old is a JSON string
          localStorage.setItem(V2_PREFIX + key, ct)
        } catch {}
      }
      localStorage.removeItem(key)
    }
  }
}

async function hydrateMemory() {
  _memoryStore = {}
  for (const key of ENCRYPTED_KEYS) {
    const ct = localStorage.getItem(V2_PREFIX + key)
    if (ct !== null) {
      try {
        const plain = await decryptStr(_cryptoKey, ct)
        _memoryStore[key] = JSON.parse(plain)
      } catch {}
    }
  }
}

// ── Public API ──────────────────────────────────────────────

export function hasAuth() {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(AUTH_KEY) !== null
}

export async function setupPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  _cryptoKey = await deriveKey(password, salt.buffer)
  const hash = await pbkdf2Hash(password, salt.buffer)
  localStorage.setItem(AUTH_KEY, JSON.stringify({ salt: ab2b64(salt.buffer), hash }))
  await migrateV1()
  await hydrateMemory()
}

export async function unlockStorage(password) {
  const raw = localStorage.getItem(AUTH_KEY)
  if (!raw) throw new Error('NO_AUTH')
  const { salt, hash } = JSON.parse(raw)
  const saltBuf = b642ab(salt)
  const testHash = await pbkdf2Hash(password, saltBuf)
  if (testHash !== hash) throw new Error('WRONG_PASSWORD')
  _cryptoKey = await deriveKey(password, saltBuf)
  await migrateV1()
  await hydrateMemory()
}

export function lockStorage() {
  _cryptoKey = null
  _memoryStore = {}
}

export function loadFromMemory(key, fallback = null) {
  return key in _memoryStore ? _memoryStore[key] : fallback
}

export function saveToMemory(key, value) {
  _memoryStore[key] = value
  persistOne(key, value) // fire-and-forget async persist
}

export function getAllMemoryData() {
  return { ..._memoryStore }
}

export async function flushAll() {
  if (!_cryptoKey) return
  for (const [key, value] of Object.entries(_memoryStore)) {
    await persistOne(key, value)
  }
}

export async function changePassword(oldPassword, newPassword) {
  const raw = localStorage.getItem(AUTH_KEY)
  if (!raw) throw new Error('NO_AUTH')
  const { salt, hash } = JSON.parse(raw)
  const saltBuf = b642ab(salt)
  const testHash = await pbkdf2Hash(oldPassword, saltBuf)
  if (testHash !== hash) throw new Error('WRONG_PASSWORD')

  const newSalt = crypto.getRandomValues(new Uint8Array(16))
  const newHash = await pbkdf2Hash(newPassword, newSalt.buffer)
  const newKey = await deriveKey(newPassword, newSalt.buffer)

  for (const key of ENCRYPTED_KEYS) {
    if (key in _memoryStore) {
      try {
        const ct = await encryptStr(newKey, JSON.stringify(_memoryStore[key]))
        localStorage.setItem(V2_PREFIX + key, ct)
      } catch {}
    }
  }

  localStorage.setItem(AUTH_KEY, JSON.stringify({ salt: ab2b64(newSalt.buffer), hash: newHash }))
  _cryptoKey = newKey
}
