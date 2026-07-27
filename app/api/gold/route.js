import { auth, clerkClient } from '@clerk/nextjs/server'
import { upsertItem } from '../../lib/supabaseStore'

export async function PATCH(request) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorised' }, { status: 401 })

  const client = await clerkClient()
  const user = await client.users.getUser(userId)
  if (user.publicMetadata?.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { item } = await request.json()
  const ok = await upsertItem('gold', item)
  if (!ok) return Response.json({ error: 'Failed to update' }, { status: 500 })
  return Response.json({ success: true, item })
}
