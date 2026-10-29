import { Server } from 'socket.io'
import { registerChatHandlers } from './handlers/chatHandlers.js'
import { registerMessageHandlers } from './handlers/messageHandlers.js'
import { registerTypingHandlers } from './handlers/typingHandlers.js'
import { initialiseChatsConnection } from './services/chatsInitialisation.js'
import { registerPresenceHandlers } from './services/presence.js'

export function configureSocket(io: Server) {
	io.on('connection', socket => {
		console.log(`User ${socket.data.id} connected`)

		registerPresenceHandlers(io, socket)
		void initialiseChatsConnection(socket).catch(error => {
			console.error('Error initializing socket chats:', error)
		})

		registerChatHandlers(io, socket)
		registerMessageHandlers(io, socket)
		registerTypingHandlers(io, socket)
	})
}
