import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'unauth' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { data, error } = await supabase
    .from('family_data')
    .select('collection, updated_at')
    .eq('family_id', 'saxena-family')
    .order('collection')

  return Response.json({
    rows: data || [],
    error: error?.message,
    count: data?.length,
  })
}
