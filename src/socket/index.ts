import { Server } from 'socket.io'
import { registerChatHandlers } from './handlers/chatHandlers.js'
import { registerMessageHandlers } from './handlers/messageHandlers.js'
import { registerTypingHandlers } from './handlers/typingHandlers.js'
import { initialiseChatsConnection } from './services/chatsInitialisation.js'
import { registerPresenceHandlers } from './services/presence.js'
import { initialiseGroupsConnection } from './services/groupsInitialisation.js'
import { registerGroupHandlers } from './handlers/groupHandlers.js'
import { registerCallHandlers } from './handlers/callHandlers.js'

export function configureSocket(io: Server) {
	io.on('connection', socket => {
		console.log(`User ${socket.data.id} connected`)

		registerPresenceHandlers(io, socket)
		void initialiseChatsConnection(socket).catch(error => {
			console.error('Error initializing socket chats:', error)
		})
		void initialiseGroupsConnection(socket).catch(error => {
			console.error('Error initializing socket groups:', error)
		})

		registerChatHandlers(io, socket)
		registerGroupHandlers(io, socket)
		registerMessageHandlers(io, socket)
		registerTypingHandlers(io, socket)
		registerCallHandlers(io, socket)
	})
}
