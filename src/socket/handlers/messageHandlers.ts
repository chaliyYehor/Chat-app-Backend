import { Socket } from 'socket.io'
import { Server } from 'socket.io'
import { conversation, conversationUser, group, message } from '../../db/schemas/schema.js'
import { and, desc, eq, or, sql } from 'drizzle-orm'
import { db } from '../../db/db.js'
import z from 'zod'
import cloudinary from '../../lib/cloudinary.js'
import { randomUUID } from 'crypto'
import { sendMessageSchema } from '../../schemas/sendMessage.js'

export function registerMessageHandlers(io: Server, socket: Socket) {
	socket.on(
		'message:send',
		async (
			data,
			cb: ({ success, error }: { success: boolean; error?: string }) => void,
		) => {
			if (!cb || typeof cb !== 'function') {
				console.error('Callback function is not provided or is not a function')
				return
			}

			const parsed = sendMessageSchema.safeParse(data)

			if (!parsed.success) {
				cb({ success: false, error: 'Invalid message data' })
				return
			}

			const userId = socket.data.id

			try {
				const conversationData = await db.query.conversation.findFirst({
					where: and(
						or(
							eq(conversation.userOneId, userId),
							eq(conversation.userTwoId, userId),
						),
						eq(conversation.id, parsed.data.conversationId),
					),
					columns: {
						userOneId: true,
						userTwoId: true,
					},
				})

				if (!conversationData) {
					cb({ success: false, error: 'User is not part of this conversation' })
					return
				}

				const otherUserId =
					conversationData.userOneId === userId
						? conversationData.userTwoId
						: conversationData.userOneId

				const messageId = randomUUID()

				const [newMessage] = await db
					.insert(message)
					.values({
						id: messageId,
						conversationId: parsed.data.conversationId,
						senderId: userId,
						type: parsed.data.type,
						text: parsed.data.text || null,
						imageUrl: parsed.data.imageUrl || null,
						imagePubId: parsed.data.imagePubId || null,
						read: false,
					})
					.returning()

				if (!newMessage) {
					throw new Error('Failed to create message')
				}

				await Promise.all([
					db
						.update(conversation)
						.set({
							lastMessage:
								parsed.data.text ??
								(parsed.data.type === 'image' ? 'Image' : null),
							lastMessageAt: newMessage.createdAt,
							updatedAt: newMessage.createdAt,
						})
						.where(eq(conversation.id, parsed.data.conversationId)),
					db
						.update(conversationUser)
						.set({
							unreadMessagesCount: sql`${conversationUser.unreadMessagesCount} + 1`,
						})
						.where(
							and(
								eq(conversationUser.conversationId, parsed.data.conversationId),
								eq(conversationUser.userId, otherUserId),
							),
						),
				])

				io.to([`user:${otherUserId}`, `user:${userId}`]).emit(
					'message:received',
					{
						conversationId: parsed.data.conversationId,
						messageId,
						lastMessage:
							parsed.data.text ??
							(parsed.data.type === 'image' ? 'Image' : null),
						lastMessageAt: newMessage.createdAt,
					},
				)
				io.to(`user:${otherUserId}`).emit('notification:new_message', {
					conversationId: parsed.data.conversationId,
					messageId,
				})

				io.to(`chat:${parsed.data.conversationId}`).emit(
					'message:new_messages',
					[newMessage],
				)
				cb({
					success: true,
				})
			} catch (error) {
				console.error('Failed to send message:', error)
				cb({
					success: false,
					error: 'Failed to send message',
				})
			}
		},
	)

	socket.on(
		'message:delete',
		async (
			data,
			cb: ({ success, error }: { success: boolean; error?: string }) => void,
		) => {
			if (!cb || typeof cb !== 'function') {
				console.error('Callback function is not provided or is not a function')
				return
			}

			const parsed = z
				.object({
					chatId: z.string().trim().min(1),
					messageId: z.string().trim().min(1),
				})
				.safeParse(data)

			if (!parsed.success) {
				cb({ success: false, error: 'Invalid data' })
				return
			}

			const userId = socket.data.id

			try {
				const messageData = await db.query.message.findFirst({
					where: and(
						eq(message.id, parsed.data.messageId),
						eq(message.conversationId, parsed.data.chatId),
						eq(message.senderId, userId),
					),
				})

				if (!messageData) {
					cb({
						success: false,
						error: 'Message not found or user is not the sender',
					})
					return
				}

				if (messageData.imagePubId) {
					const cloudinaryResult = await cloudinary.uploader.destroy(
						messageData.imagePubId,
						{ resource_type: 'image' },
					)

					if (
						cloudinaryResult.result !== 'ok' &&
						cloudinaryResult.result !== 'not found'
					) {
						cb({ success: false, error: 'Failed to delete image' })
						return
					}
				}

				await db.delete(message).where(eq(message.id, messageData.id))

				const lastMessageData = await db.query.message.findFirst({
					where: eq(message.conversationId, parsed.data.chatId),
					orderBy: desc(message.createdAt),
					columns: {
						text: true,
						type: true,
						createdAt: true,
					},
				})

				await db
					.update(conversation)
					.set({
						lastMessage: lastMessageData
							? (lastMessageData.text ??
								(lastMessageData.type === 'image' ? 'Image' : null))
							: null,
						lastMessageAt: lastMessageData?.createdAt ?? null,
						updatedAt: new Date(),
					})
					.where(eq(conversation.id, parsed.data.chatId))

				io.to(`chat:${parsed.data.chatId}`).emit('message:deleted', {
					conversationId: parsed.data.chatId,
					messageId: messageData.id,
					lastMessage: lastMessageData
						? (lastMessageData.text ??
							(lastMessageData.type === 'image' ? 'Image' : null))
						: null,
					lastMessageAt: lastMessageData?.createdAt ?? null,
				})

				cb({ success: true })
			} catch (error) {
				console.error('Failed to delete message:', error)
				cb({
					success: false,
					error: 'Failed to delete message',
				})
			}
		},
	)
	socket.on(
		'message:delete_group',
		async (
			data,
			cb: ({ success, error }: { success: boolean; error?: string }) => void,
		) => {
			if (!cb || typeof cb !== 'function') {
				console.error('Callback function is not provided or is not a function')
				return
			}

			const parsed = z
				.object({
					groupId: z.string().trim().min(1),
					messageId: z.string().trim().min(1),
				})
				.safeParse(data)

			if (!parsed.success) {
				cb({ success: false, error: 'Invalid data' })
				return
			}

			const userId = socket.data.id

			try {
				const messageData = await db.query.message.findFirst({
					where: and(
						eq(message.id, parsed.data.messageId),
						eq(message.groupId, parsed.data.groupId),
						eq(message.senderId, userId),
					),
				})

				if (!messageData) {
					cb({
						success: false,
						error: 'Message not found or user is not the sender',
					})
					return
				}

				if (messageData.imagePubId) {
					const cloudinaryResult = await cloudinary.uploader.destroy(
						messageData.imagePubId,
						{ resource_type: 'image' },
					)

					if (
						cloudinaryResult.result !== 'ok' &&
						cloudinaryResult.result !== 'not found'
					) {
						cb({ success: false, error: 'Failed to delete image' })
						return
					}
				}

				await db.delete(message).where(eq(message.id, messageData.id))

				const lastMessageData = await db.query.message.findFirst({
					where: eq(message.groupId, parsed.data.groupId),
					orderBy: desc(message.createdAt),
					columns: {
						text: true,
						type: true,
						createdAt: true,
					},
				})

				await db
					.update(group)
					.set({
						lastMessage: lastMessageData
							? (lastMessageData.text ??
								(lastMessageData.type === 'image' ? 'Image' : null))
							: null,
						lastMessageAt: lastMessageData?.createdAt ?? null,
					})
					.where(eq(group.id, parsed.data.groupId))

				io.to(`group:${parsed.data.groupId}`).emit('message:deleted_group', {
					groupId: parsed.data.groupId,
					messageId: messageData.id,
				})

				cb({ success: true })
			} catch (error) {
				console.error('Failed to delete message:', error)
				cb({
					success: false,
					error: 'Failed to delete message',
				})
			}
		},
	)
	socket.on(
		'message:mark_as_read',
		async (
			data,
			cb: ({ success, error }: { success: boolean; error?: string }) => void,
		) => {
			if (!cb || typeof cb !== 'function') {
				console.error('Callback function is not provided or is not a function')
				return
			}

			const parsed = z
				.object({ chatId: z.string().trim().min(1) })
				.safeParse(data)

			if (!parsed.success) {
				cb({ success: false, error: 'Invalid data' })
				return
			}

			const userId = socket.data.id

			try {
				await db
					.update(conversationUser)
					.set({
						unreadMessagesCount: 0,
					})
					.where(
						and(
							eq(conversationUser.conversationId, parsed.data.chatId),
							eq(conversationUser.userId, userId),
						),
					)

				const userIdsInChat = await db.query.conversation.findFirst({
					where: eq(conversation.id, parsed.data.chatId),
					columns: {
						userOneId: true,
						userTwoId: true,
					},
				})

				let otherUserId

				if (userIdsInChat) {
					otherUserId =
						userIdsInChat?.userOneId === userId
							? userIdsInChat.userTwoId
							: userIdsInChat?.userOneId
				}

				if (otherUserId) {
					await db
						.update(message)
						.set({ read: true })
						.where(
							and(
								eq(message.conversationId, parsed.data.chatId),
								eq(message.senderId, otherUserId),
							),
						)

					io.to(`user:${otherUserId}`).emit('message:read', {
						conversationId: parsed.data.chatId,
					})
				}

				cb({ success: true })
			} catch (error) {
				console.error('Failed to mark messages as read:', error)
				cb({
					success: false,
					error: 'Failed to mark messages as read',
				})
			}
		},
	)
}
