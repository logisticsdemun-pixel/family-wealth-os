import { NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { processPendingSIPAllotments } from '../../../lib/sipProcessor'

export const runtime = 'nodejs'

export async function POST(request) {
  // Accept either: Vercel cron secret OR an admin Clerk session
  const authHeader = request.headers.get('authorization') || ''
  const cronSecret = process.env.CRON_SECRET

  let authorized = false

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
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
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
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
