import { auth, clerkClient } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

const FAMILY_ID = 'saxena-family'

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

export async function PATCH(request) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorised' }, { status: 401 })

  const client = await clerkClient()
  const user = await client.users.getUser(userId)
  if (user.publicMetadata?.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { item } = await request.json()
  const supabase = getServiceSupabase()

  // Read current gold array
  const { data: row, error: readError } = await supabase
    .from('family_data')
    .select('data')
    .eq('family_id', FAMILY_ID)
    .eq('collection', 'gold')
    .single()

  if (readError && readError.code !== 'PGRST116') {
    return Response.json({ error: `Read failed: ${readError.message}` }, { status: 500 })
  }

  const arr = Array.isArray(row?.data) ? row.data : []
  const idx = arr.findIndex(g => String(g.id) === String(item.id))
  const updated = idx >= 0
    ? arr.map((g, n) => n === idx ? item : g)
    : [...arr, item]

  const { error: writeError } = await supabase
    .from('family_data')
    .upsert(
      { family_id: FAMILY_ID, collection: 'gold', data: updated },
      { onConflict: 'family_id,collection' }
    )

  if (writeError) {
    return Response.json({ error: `Write failed: ${writeError.message}` }, { status: 500 })
  }

  return Response.json({ success: true, item })
}
