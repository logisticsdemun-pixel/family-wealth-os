import { auth, clerkClient } from '@clerk/nextjs/server'

export async function POST() {
  const { userId } = await auth()

  if (!userId) {
    return Response.json({ error: 'Not signed in' }, { status: 401 })
  }

  const client = await clerkClient()
  const users = await client.users.getUserList()
  const hasAdmin = users.data.some(u => u.publicMetadata?.role === 'admin')

  if (hasAdmin) {
    return Response.json({ error: 'Admin already exists' }, { status: 400 })
  }

  await client.users.updateUserMetadata(userId, {
    publicMetadata: { role: 'admin' },
  })

  return Response.json({ success: true, message: 'You are now admin' })
}
