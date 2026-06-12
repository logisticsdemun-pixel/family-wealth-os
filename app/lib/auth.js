import { setupPassword, unlockStorage, lockStorage } from './crypto'

let _unlocked = false

export async function unlock(password, mode) {
  try {
    if (mode === 'setup') await setupPassword(password)
    else await unlockStorage(password)
    _unlocked = true
    if (typeof window !== 'undefined') localStorage.setItem('fwos:session', 'active')
    return true
  } catch {
    return false
  }
}

export function isSessionUnlocked() {
  return _unlocked
}

export function lock() {
  _unlocked = false
  lockStorage()
  if (typeof window !== 'undefined') localStorage.removeItem('fwos:session')
}

export function hasPersistedSession() {
  if (typeof window === 'undefined') return false
  return localStorage.getItem('fwos:session') === 'active'
}
