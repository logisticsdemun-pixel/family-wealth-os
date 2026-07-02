import { auth, clerkClient } from '@clerk/nextjs/server'

export async function POST() {
  const { userId } = await auth()

  if (!userId) {
    return Response.json({ error: 'Not signed in' }, { status: 401 })
  }

  const client = await clerkClient()
  const caller = await client.users.getUser(userId)

  const primaryEmail = caller.emailAddresses
    .find(e => e.id === caller.primaryEmailAddressId)?.emailAddress ?? ''
  const bootstrapEmail = process.env.ADMIN_BOOTSTRAP_EMAIL ?? ''

  if (!bootstrapEmail || primaryEmail.toLowerCase() !== bootstrapEmail.toLowerCase()) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

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
