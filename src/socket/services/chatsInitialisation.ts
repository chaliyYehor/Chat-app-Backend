import { Socket } from 'socket.io'
import { db } from '../../db/db.js'
import { eq } from 'drizzle-orm'
import { conversationUser } from '../../db/schemas/schema.js'

export async function initialiseChatsConnection(socket: Socket) {
	const chatIds = await db.query.conversationUser.findMany({
		where: eq(conversationUser.userId, socket.data.id),
		columns: {
			conversationId: true,
		},
	})

	socket.join(chatIds.map(id => `chat:${id.conversationId}`))
}
