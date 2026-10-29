import type { Server, Socket } from 'socket.io'
import { and, eq, ne } from 'drizzle-orm'
import { db } from '../../db/db.js'
import { conversationUser, userProfile } from '../../db/schemas/schema.js'

const DISCONNECT_GRACE_PERIOD_MS = 750
const pendingOfflineTimers = new Map<string, ReturnType<typeof setTimeout>>()

export function registerPresenceHandlers(io: Server, socket: Socket) {
	const userId = socket.data.id as string
	const userRoom = `user:${userId}`

	socket.join(userRoom)
	clearPendingOfflineTimer(userId)
	void updatePresence(io, userId, 'online')

	socket.on('disconnect', reason => {
		console.log(`User ${userId} disconnected: ${reason}`)

		clearPendingOfflineTimer(userId)
		const timer = setTimeout(() => {
			if (pendingOfflineTimers.get(userId) !== timer) return
			pendingOfflineTimers.delete(userId)
			void markOfflineIfDisconnected(io, userId)
		}, DISCONNECT_GRACE_PERIOD_MS)

		pendingOfflineTimers.set(userId, timer)
	})
}

function clearPendingOfflineTimer(userId: string) {
	const timer = pendingOfflineTimers.get(userId)
	if (timer) clearTimeout(timer)
	pendingOfflineTimers.delete(userId)
}

async function markOfflineIfDisconnected(io: Server, userId: string) {
	try {
		const activeSockets = await io.in(`user:${userId}`).fetchSockets()
		if (activeSockets.length > 0) return

		await updatePresence(io, userId, 'offline')

		// A socket could connect while the database update was in progress.
		const socketsAfterUpdate = await io.in(`user:${userId}`).fetchSockets()
		if (socketsAfterUpdate.length > 0) await updatePresence(io, userId, 'online')
	} catch (error) {
		console.error('Error updating presence after socket disconnection:', error)
	}
}

async function updatePresence(
	io: Server,
	userId: string,
	status: 'online' | 'offline',
) {
	try {
		const updates =
			status === 'offline'
				? { status, lastSeen: new Date() }
				: { status }
		const changed = await db
			.update(userProfile)
			.set(updates)
			.where(
				and(
					eq(userProfile.userId, userId),
					ne(userProfile.status, status),
				),
			)
			.returning({ userId: userProfile.userId })

		if (changed.length === 0) return

		const memberships = await db.query.conversationUser.findMany({
			where: eq(conversationUser.userId, userId),
			columns: { conversationId: true },
		})
		const chatRooms = memberships.map(
			({ conversationId }) => `chat:${conversationId}`,
		)
		if (chatRooms.length > 0) {
			io.to(chatRooms).emit('presence:changed', { userId })
		}
	} catch (error) {
		console.error(`Error setting user ${userId} ${status}:`, error)
	}
}
