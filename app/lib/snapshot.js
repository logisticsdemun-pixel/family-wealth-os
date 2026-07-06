'use client'
// Client-side snapshot writes are disabled — snapshots are now owned by the
// server-side daily-snapshot cron (/api/cron/daily-snapshot).
// Legacy implementation preserved in snapshot.legacy.js.
import { load, KEYS } from './storage'

export function takeSnapshot() {
  // no-op: server cron owns all snapshot writes
}

export function takeSnapshotFromStorage() {
  // no-op: server cron owns all snapshot writes
}

export function getSnapshots() {
  return load(KEYS.SNAPSHOTS, []) || []
}
