import { NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { timingSafeEqual } from 'node:crypto'
import { processPendingSIPAllotments } from '../../../lib/sipProcessor'

export const runtime = 'nodejs'

function timingSafeEqualStr(a, b) {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

export async function POST(request) {
  // Accept either: Vercel cron secret OR an admin Clerk session
  const authHeader = request.headers.get('authorization') || ''
  const expected = process.env.CRON_SECRET

  let authorized = false

  const ok = !!expected && timingSafeEqualStr(authHeader, `Bearer ${expected}`)
  if (ok) {
    authorized = true
  } else {
    // Fallback: valid Clerk admin session (for AppShell trigger)
    try {
      const { userId } = await auth()
      if (userId) {
        const client = await clerkClient()
        const caller = await client.users.getUser(userId)
        if (caller.publicMetadata?.role === 'admin') authorized = true
      }
    } catch {}
  }

  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await processPendingSIPAllotments()
    console.log('[cron/sip-allotment]', result)
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    console.error('[cron/sip-allotment] Error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// Also allow GET for Vercel cron (Vercel sends GET requests to cron endpoints)
export async function GET(request) {
  const authHeader = request.headers.get('authorization') || ''
  const expected = process.env.CRON_SECRET

  const ok = !!expected && timingSafeEqualStr(authHeader, `Bearer ${expected}`)
  if (!ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await processPendingSIPAllotments()
    console.log('[cron/sip-allotment]', result)
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    console.error('[cron/sip-allotment] Error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
