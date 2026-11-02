import type { Server, Socket } from 'socket.io'
import { and, eq } from 'drizzle-orm'
import z from 'zod'
import { db } from '../../db/db.js'
import { groupUser } from '../../db/schemas/schema.js'

export function registerTypingHandlers(io: Server, socket: Socket) {
	const chatTypingSchema = z.object({ chatId: z.string().trim().min(1).max(100) })
	const groupTypingSchema = z.object({
		groupId: z.string().trim().min(1).max(100),
	})

	socket.on('typing:start', data => {
		const parsed = chatTypingSchema.safeParse(data)
		if (!parsed.success) return
		const { chatId } = parsed.data
		socket
			.to(`chat:${chatId}`)
			.emit('typing:start', { chatId, userId: socket.data.id })
	})

	socket.on('typing:stop', data => {
		const parsed = chatTypingSchema.safeParse(data)
		if (!parsed.success) return
		const { chatId } = parsed.data
		socket
			.to(`chat:${chatId}`)
			.emit('typing:stop', { chatId, userId: socket.data.id })
	})

	const registerGroupTyping = (event: 'group:typing:start' | 'group:typing:stop') => {
		socket.on(event, async data => {
			const parsed = groupTypingSchema.safeParse(data)
			if (!parsed.success) return

			const { groupId } = parsed.data
			try {
				const membership = await db.query.groupUser.findFirst({
					where: and(
						eq(groupUser.groupId, groupId),
						eq(groupUser.userId, socket.data.id),
					),
					columns: { userId: true },
				})
				if (!membership) return

				socket.to(`group:${groupId}`).emit(event, {
					groupId,
					userId: socket.data.id,
				})
			} catch (error) {
				console.error(`Failed to handle ${event}:`, error)
			}
		})
	}

	registerGroupTyping('group:typing:start')
	registerGroupTyping('group:typing:stop')
}
