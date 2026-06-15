import { auth, clerkClient } from '@clerk/nextjs/server'

export async function POST(request) {
  const { userId: adminId } = await auth()

  if (!adminId) {
    return Response.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const client = await clerkClient()
  const adminUser = await client.users.getUser(adminId)

  if (adminUser.publicMetadata?.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { userId, role } = await request.json()

  const validRoles = ['admin', 'member', 'viewer']
  if (!validRoles.includes(role)) {
    return Response.json({ error: 'Invalid role' }, { status: 400 })
  }

  if (userId === adminId && role !== 'admin') {
    return Response.json(
      { error: 'Cannot change your own admin role' },
      { status: 400 }
    )
  }

  await client.users.updateUserMetadata(userId, { publicMetadata: { role } })

  return Response.json({ success: true, userId, role })
}
