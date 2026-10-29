import type { auth } from '../lib/auth.js'

declare module 'socket.io' {
	interface SocketData {
		id: string
		user: typeof auth.$Infer.Session.user
	}
}

export {}
