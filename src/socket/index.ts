import { Server } from 'socket.io'
import { conversationUser, userProfile } from '../db/schemas/schema.js'
import { db } from '../db/db.js'
import { eq } from 'drizzle-orm'
import { registerChatHandlers } from './handlers/chatHandlers.js'
import { registerMessageHandlers } from './handlers/messageHandlers.js'
import { registerTypingHandlers } from './handlers/typingHandlers.js'
import { initialiseChatsConnection } from './services/chatsInitialisation.js'

export function configureSocket(io: Server) {
	io.on('connection', async (socket) => {
		console.log(`User ${socket.data.id} connected`)

		socket.join(`user:${socket.data.id}`)

		await initialiseChatsConnection(socket)

		try {
			await db
				.update(userProfile)
				.set({ status: 'online' })
				.where(eq(userProfile.userId, socket.data.id))
		} catch (error) {
			console.error('Error during socket connection:', error)
		}

		socket.on('disconnect', async reason => {
			console.log(`User ${socket.data.id} disconnected: ${reason}`)

			try {
				await db
					.update(userProfile)
					.set({ status: 'offline', lastSeen: new Date() })
					.where(eq(userProfile.userId, socket.data.id))
			} catch (error) {
				console.error('Error during socket disconnection:', error)
			}
		})

		registerChatHandlers(io, socket)
		registerMessageHandlers(io, socket)
		registerTypingHandlers(io, socket)
	})
}
