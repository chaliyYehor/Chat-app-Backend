import { Server, Socket } from 'socket.io'
import { conversation, conversationUser, message, user, userProfile } from '../../db/schemas/schema.js'
import { db } from '../../db/db.js'
import { and, eq, or } from 'drizzle-orm'
import cloudinary from '../../lib/cloudinary.js'
import z from 'zod'
import { randomUUID } from 'crypto'

export function registerChatHandlers(io: Server, socket: Socket) {
	socket.on(
		'chat:create-chat',
		async (
			data: { userId: string },
			cb: ({
				success,
				error,
				conversationId,
			}: {
				success: boolean
				error?: string
				conversationId?: string
			}) => void,
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
						error: 'Conversation already exists',
						conversationId: existingConversation.id,
					})
					return
				}

				const conversationId = randomUUID()

				const { created: createdConversation, memberships } = await db.transaction(async tx => {
					const [created] = await tx
						.insert(conversation)
						.values({
							id: conversationId,
							userOneId: socket.data.id,
							userTwoId: userId,
						})
						.returning()

					const memberships = await tx
						.insert(conversationUser)
						.values([
							{ conversationId, userId: socket.data.id },
							{ conversationId, userId },
						])
						.returning()
					return { created, memberships }
				})
				const profiles = await db.query.userProfile.findMany({
				where: or(
					eq(userProfile.userId, socket.data.id),
					eq(userProfile.userId, userId),
				),
					columns: {
						userId: true,
						name: true,
						imageUrl: true,
						status: true,
						previouslySetStatus: true,
						lastSeen: true,
					},
				})
				io.in([`user:${socket.data.id}`, `user:${userId}`]).socketsJoin(
					`chat:${conversationId}`,
				)

				for (const participantId of [socket.data.id, userId]) {
					io.to(`user:${participantId}`).emit('chat:added', {
						conversation: createdConversation,
						conversationUser: memberships.find(
							membership => membership.userId === participantId,
						),
						userOne: profiles.find(
							profile => profile.userId === createdConversation.userOneId,
						),
						userTwo: profiles.find(
							profile => profile.userId === createdConversation.userTwoId,
						),
					})
				}

				cb({
					success: true,
					conversationId,
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
					userOneId: true,
					userTwoId: true,
				},
			})

			if (!userValid) {
				cb({ success: false, error: 'Unauthorized' })
				return
			}

			try {
				const chatImages = await db.query.message.findMany({
					where: eq(message.conversationId, conversationId),
					columns: {
						imagePubId: true,
					},
				})

				const imagePublicIds = chatImages
					.map(chatMessage => chatMessage.imagePubId)
					.filter((publicId): publicId is string => Boolean(publicId))

				const imageDeleteResults = await Promise.all(
					imagePublicIds.map(publicId =>
						cloudinary.uploader.destroy(publicId, { resource_type: 'image' }),
					),
				)

				if (
					imageDeleteResults.some(
						result => result.result !== 'ok' && result.result !== 'not found',
					)
				) {
					cb({ success: false, error: 'Failed to delete chat images' })
					return
				}

				await db.delete(conversation).where(eq(conversation.id, conversationId))

				io.to([
					`chat:${conversationId}`,
					`user:${userValid.userOneId}`,
					`user:${userValid.userTwoId}`,
				]).emit('chat:deleted', { conversationId })
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

	socket.on(
		'chat:clear-chat',
		async (
			data,
			cb: ({ success, error }: { success: boolean; error?: string }) => void,
		) => {
			if (!cb || typeof cb !== 'function') {
				console.error('Callback function is not provided or is not a function')
				return
			}

			const parsed = z
				.object({ conversationId: z.string().trim().min(1) })
				.safeParse(data)

			if (!parsed.success) {
				cb({ success: false, error: 'Invalid data' })
				return
			}

			const { conversationId } = parsed.data
			const userId = socket.data.id

			try {
				const checkIfUserIsInConversation =
					await db.query.conversation.findFirst({
						where: and(
							eq(conversation.id, parsed.data.conversationId),
							or(
								eq(conversation.userOneId, userId),
								eq(conversation.userTwoId, userId),
							),
						),
						columns: {
							userOneId: true,
							userTwoId: true,
						},
					})

				if (!checkIfUserIsInConversation) {
					cb({ success: false, error: 'User is not part of this conversation' })
					return
				}

				const otherUserId =
					checkIfUserIsInConversation.userOneId === userId
						? checkIfUserIsInConversation.userTwoId
						: checkIfUserIsInConversation.userOneId

				const chatImages = await db.query.message.findMany({
					where: eq(message.conversationId, conversationId),
					columns: {
						imagePubId: true,
					},
				})

				const imagePublicIds = chatImages
					.map(chatMessage => chatMessage.imagePubId)
					.filter((publicId): publicId is string => Boolean(publicId))

				const imageDeleteResults = await Promise.all(
					imagePublicIds.map(publicId =>
						cloudinary.uploader.destroy(publicId, { resource_type: 'image' }),
					),
				)

				if (
					imageDeleteResults.some(
						result => result.result !== 'ok' && result.result !== 'not found',
					)
				) {
					cb({ success: false, error: 'Failed to clear chat images' })
					return
				}

				await db
					.delete(message)
					.where(eq(message.conversationId, conversationId))

				await db
					.update(conversation)
					.set({ lastMessage: null, lastMessageAt: null, updatedAt: new Date() })
					.where(eq(conversation.id, conversationId))

				await db.update(conversationUser).set({ unreadMessagesCount: 0 }).where(
					and(
						eq(conversationUser.conversationId, conversationId),
						eq(conversationUser.userId, otherUserId),
					),
				)
				await db.update(conversationUser).set({ unreadMessagesCount: 0 }).where(
					and(
						eq(conversationUser.conversationId, conversationId),
						eq(conversationUser.userId, userId),
					),
				)

				io.to(`chat:${conversationId}`).emit('chat:cleared', { conversationId })

				cb({
					success: true,
				})
			} catch (error) {
				console.error('Failed to clear chat:', error)
				cb({
					success: false,
					error: 'Failed to clear chat',
				})
			}
		},
	)
}
