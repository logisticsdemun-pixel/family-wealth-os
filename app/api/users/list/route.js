import { auth, clerkClient } from '@clerk/nextjs/server'

export async function GET() {
  const { userId } = await auth()

  if (!userId) {
    return Response.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const client = await clerkClient()
  const caller = await client.users.getUser(userId)

  if (caller.publicMetadata?.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const users = await client.users.getUserList({
    limit: 50,
    orderBy: '-created_at',
  })

  return Response.json({
    users: users.data.map(u => ({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      imageUrl: u.imageUrl,
      emailAddresses: u.emailAddresses,
      publicMetadata: u.publicMetadata,
      createdAt: u.createdAt,
    })),
  })
}
