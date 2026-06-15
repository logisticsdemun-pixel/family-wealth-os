import { setupPassword, unlockStorage, restoreFromSession } from './crypto'

let _unlocked = false

export function isSessionUnlocked() {
  return _unlocked
}

// Auto-unlock using a per-device key stored in localStorage.
// No user password required — Clerk handles identity.
export async function autoUnlock() {
  if (_unlocked) return true

  // Fast path: AES key already in sessionStorage (survives page reload)
  try {
    const ok = await restoreFromSession()
    if (ok) { _unlocked = true; return true }
  } catch {}

  // Derive key from device key stored in localStorage
  try {
    let deviceKey = typeof window !== 'undefined'
      ? localStorage.getItem('fwos:device-key')
      : null

    if (!deviceKey) {
      deviceKey = crypto.randomUUID()
      localStorage.setItem('fwos:device-key', deviceKey)
      await setupPassword(deviceKey)
    } else {
      try {
        await unlockStorage(deviceKey)
      } catch {
        // Device key doesn't match stored auth (old password system) → fresh setup
        deviceKey = crypto.randomUUID()
        localStorage.setItem('fwos:device-key', deviceKey)
        await setupPassword(deviceKey)
      }
    }
    _unlocked = true
    return true
  } catch {
    _unlocked = false
    return false
  }
}
