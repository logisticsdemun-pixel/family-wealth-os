import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

const FAMILY_ID = 'saxena-family'

export async function POST(request) {
  const { userId } = await auth()
  if (!userId) {
    return Response.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const body = await request.json()
  const { localData } = body

  if (!localData || typeof localData !== 'object') {
    return Response.json({ error: 'No data provided' }, { status: 400 })
  }

  const results = {}

  for (const [collection, value] of Object.entries(localData)) {
    if (value === null || value === undefined) {
      results[collection] = 'skipped (null)'
      continue
    }

    const isEmpty = Array.isArray(value) ? value.length === 0
      : typeof value === 'object' ? Object.keys(value).length === 0
      : false

    if (isEmpty) {
      results[collection] = 'skipped (empty)'
      continue
    }

    const { error } = await supabase
      .from('family_data')
      .upsert(
        { family_id: FAMILY_ID, collection, data: value },
        { onConflict: 'family_id,collection' }
      )

    const count = Array.isArray(value) ? `${value.length} items` : 'object'
    results[collection] = error ? `error: ${error.message}` : `migrated (${count})`
  }

  return Response.json({ success: true, results })
}
