import { Socket } from 'socket.io'
import { Server } from 'socket.io'

export function registerTypingHandlers(io: Server, socket: Socket) {
	socket.on('typing:start', ({ chatId }) => {
		socket
			.to(`chat:${chatId}`)
			.emit('typing:start', { chatId, userId: socket.data.id })
	})

	socket.on('typing:stop', ({ chatId }) => {
		socket
			.to(`chat:${chatId}`)
			.emit('typing:stop', { chatId, userId: socket.data.id })
	})
}
