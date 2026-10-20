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
import {
	conversation,
	conversationUser,
	user,
	userProfile,
} from './db/schemas/schema.js'
import { and, eq, or } from 'drizzle-orm'
import z from 'zod'
import { BadRequestError } from './errors/badRequest.js'
import { randomUUID } from 'crypto'

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

	socket.join(`user:${socket.data.id}`)

	const chatIds = await db.query.conversationUser.findMany({
		where: eq(conversationUser.userId, socket.data.id),
		columns: {
			conversationId: true,
		},
	})

	socket.join(chatIds.map(id => `chat:${id.conversationId}`))

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

	socket.on(
		'chat:create-chat',
		async (
			data: { userId: string },
			cb: ({ success, error }: { success: boolean; error?: string }) => void,
		) => {
			if (!cb || typeof cb !== 'function') {
				console.error('Callback function is not provided or is not a function')
				return
			}

			const parsed = z
				.object({ userId: z.string().trim().min(1).max(100) })
				.safeParse(data)

			if (!parsed.success) {
				cb({ success: false, error: 'Invalid Credentials' })
				return
			}

			const { userId } = parsed.data

			if (socket.data.id === userId) {
				cb({
					success: false,
					error: 'You cannot create a chat with yourself',
				})
				return
			}

			try {
				const existingUser = await db.query.user.findFirst({
					where: eq(user.id, userId),
				})
				if (!existingUser) {
					cb({
						success: false,
						error: 'User not found',
					})
					return
				}

				const existingConversation = await db.query.conversation.findFirst({
					where: or(
						and(
							eq(conversation.userOneId, socket.data.id),
							eq(conversation.userTwoId, userId),
						),
						and(
							eq(conversation.userOneId, userId),
							eq(conversation.userTwoId, socket.data.id),
						),
					),
				})

				if (existingConversation) {
					cb({
						success: false,
						error: 'Conversation already exists : ' + existingConversation.id,
					})
					return
				}

				const conversationId = randomUUID()

				await db.transaction(async tx => {
					await tx.insert(conversation).values({
						id: conversationId,
						userOneId: socket.data.id,
						userTwoId: userId,
					})

					await tx.insert(conversationUser).values([
						{
							conversationId,
							userId: socket.data.id,
						},
						{
							conversationId,
							userId,
						},
					])
				})
				io.in([`user:${socket.data.id}`, `user:${userId}`]).socketsJoin(
					`chat:${conversationId}`,
				)

				io.to([`user:${socket.data.id}`, `user:${userId}`]).emit('chat:added')
				
				cb({
					success: true,
				})
			} catch (error) {
				console.error('Failed to create chat:', error)

				cb({
					success: false,
					error: 'Failed to create chat',
				})
			}
		},
	)
	socket.on(
		'chat:delete-chat',
		async (
			data: { conversationId: string },
			cb: ({ success, error }: { success: boolean; error?: string }) => void,
		) => {
			if (!cb || typeof cb !== 'function') {
				console.error('Callback function is not provided or is not a function')
				return
			}

			const parsed = z
				.object({ conversationId: z.string().trim().min(1).max(100) })
				.safeParse(data)

			if (!parsed.success) {
				cb({ success: false, error: 'Invalid Credentials' })
				return
			}

			const { conversationId } = parsed.data

			const userValid = await db.query.conversation.findFirst({
				where: and(
					eq(conversation.id, conversationId),
					or(
						eq(conversation.userOneId, socket.data.id),
						eq(conversation.userTwoId, socket.data.id),
					),
				),
				columns: {
					id: true,
				},
			})

			if (!userValid) {
				cb({ success: false, error: 'Unauthorized' })
				return
			}

			try {
				await db.delete(conversation).where(eq(conversation.id, conversationId))

				io.to(`chat:${conversationId}`).emit('chat:deleted')
				io.in(`chat:${conversationId}`).socketsLeave(`chat:${conversationId}`)

				cb({
					success: true,
				})
			} catch (error) {
				console.error('Failed to delete chat:', error)

				cb({
					success: false,
					error: 'Failed to delete chat',
				})
			}
		},
	)

	socket.on(
		'chat:pin-chat',
		async (
			{ conversationId, value }: { conversationId: string; value: boolean },
			cb: ({ success, error }: { success: boolean; error?: string }) => void,
		) => {
			if (!cb || typeof cb !== 'function') {
				console.error('Callback function is not provided or is not a function')
				return
			}

			const parsed = z
				.object({
					conversationId: z.string().trim().min(1).max(100),
					value: z.boolean(),
				})
				.safeParse({ conversationId, value })
			if (!parsed.success) {
				cb({ success: false, error: 'Invalid Credentials' })
				return
			}

			console.log('reached')

			const { conversationId: conversationIdParsed, value: valueParsed } =
				parsed.data

			try {
				const updatedRows = await db
					.update(conversationUser)
					.set({ isPinned: valueParsed })
					.where(
						and(
							eq(conversationUser.conversationId, conversationIdParsed),
							eq(conversationUser.userId, socket.data.id),
						),
					)

				if (updatedRows.rowCount === 0) {
					cb({
						success: false,
						error: 'Conversation not found',
					})
					return
				}

				cb({
					success: true,
				})
			} catch (error) {
				console.error('Failed to pin chat:', error)

				cb({
					success: false,
					error: 'Failed to pin chat',
				})
			}
		},
	)
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
