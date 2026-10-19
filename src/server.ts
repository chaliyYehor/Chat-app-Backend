import cors from 'cors'
import 'dotenv/config'
import express from 'express'
import { xss } from 'express-xss-sanitizer'
import helmet from 'helmet'
import http from 'http'
import { StatusCodes } from 'http-status-codes'
import { Server } from 'socket.io'
import './lib/jobs/health-check.js'
import { errorMiddleware } from './middleware/errorHandlingMiddleware.js'
import { fromNodeHeaders, toNodeHandler } from 'better-auth/node'
import { auth } from './lib/auth.js'
import userInfoRouter from './routers/userInfoRouter.js'
import { authenticationMiddleware } from './middleware/authenticationMiddleware.js'
import messagesRouter from './routers/messagesRouter.js'
import { UnauthorizedError } from './errors/unauthorized.js'
import { db } from './db/db.js'
import { userProfile } from './db/schemas/schema.js'
import { eq } from 'drizzle-orm'

const PORT = Number(process.env.PORT) || 5000
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173'
const VERCEL_CLIENT_URL = process.env.VERCEL_CLIENT_URL as string

const app = express()
const server = http.createServer(app)

const allowedOrigins = [CLIENT_URL, VERCEL_CLIENT_URL]

const io = new Server(server, {
	path: '/ws',
	cors: {
		origin: allowedOrigins,
		credentials: true,
	},
})

app.use(helmet())

app.use(
	cors({
		origin: allowedOrigins,
		credentials: true,
	}),
)

app.use(express.json())
app.use(xss())

app.all('/api/auth/*splat', toNodeHandler(auth))

io.use(async (socket, next) => {
	try {
		const session = await auth.api.getSession({
			headers: fromNodeHeaders(socket.handshake.headers),
		})

		if (!session) return next(new UnauthorizedError('Unauthorized'))

		socket.data.id = session.user.id
		socket.data.user = session.user
		next()
	} catch (error) {
		return next(new UnauthorizedError('Unauthorized'))
	}
})

io.on('connection', async socket => {
	console.log(`User ${socket.data.id} connected`)
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
				.set({ status: 'offline' })
				.where(eq(userProfile.userId, socket.data.id))
		} catch (error) {
			console.error('Error during socket disconnection:', error)
		}
	})
})

app.use('/api/user', authenticationMiddleware, userInfoRouter)
app.use('/api/chat', authenticationMiddleware, messagesRouter)

app.get('/health', (req, res) => {
	res.status(StatusCodes.OK).send()
})

app.use(errorMiddleware)

server.listen(PORT, () => {
	console.log(`Server is listening on port ${PORT}`)
})
