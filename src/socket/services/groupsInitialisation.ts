import { Socket } from 'socket.io'
import { db } from '../../db/db.js'
import { groupUser } from '../../db/schemas/schema.js'
import { eq } from 'drizzle-orm'

export async function initialiseGroupsConnection(socket: Socket) {
	const groupIds = await db.query.groupUser.findMany({
		where: eq(groupUser.userId, socket.data.id),
		columns: {
			groupId: true,
		},
	})

	socket.join(groupIds.map(id => `group:${id.groupId}`))
}
