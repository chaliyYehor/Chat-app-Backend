import { Server, Socket } from 'socket.io'
import z from 'zod'
import { db } from '../../db/db.js'
import {
	group,
	groupUser,
	message,
	user,
	userPreferences,
	userProfile,
} from '../../db/schemas/schema.js'
import { sendGroupMessageSchema } from '../../schemas/sendGroupMessage.js'
import { and, eq, ne, sql } from 'drizzle-orm'
import cloudinary from '../../lib/cloudinary.js'

export const registerGroupHandlers = (io: Server, socket: Socket) => {
	socket.on(
		'group:create-group',
		async (
			data,
			cb: ({
				success,
				error,
				groupId,
			}: {
				success: boolean
				error?: string
				groupId?: string
			}) => void,
		) => {
			console.log('Received group:create-group event with data:', data)

			if (!cb || typeof cb !== 'function') {
				console.error('Callback function is not provided or is not a function')
				return
			}

			const parsed = z
				.object({
					groupName: z.string().trim().min(1).max(100),
					peopleToAdd: z
						.array(z.object({ id: z.string().trim().min(1).max(100) }))
						.min(1),
				})
				.safeParse(data)

			if (!parsed.success) {
				cb({ success: false, error: 'Invalid Credentials' })
				return
			}

			const userId = socket.data.id

			try {
				const groupId = crypto.randomUUID()

				const memberIds = [
					...new Set([
						userId,
						...parsed.data.peopleToAdd.map(person => person.id),
					]),
				]

				await db.transaction(async tx => {
					await tx.insert(group).values({
						id: groupId,
						memberIds,
						groupName: parsed.data.groupName,
					})

					await tx.insert(groupUser).values(
						memberIds.map(memberId => ({
							groupId,
							userId: memberId,
							role:
								memberId === userId ? ('admin' as const) : ('member' as const),
						})),
					)
				})

				io.in([
					`user:${userId}`,
					...parsed.data.peopleToAdd.map(p => `user:${p.id}`),
				]).socketsJoin(`group:${groupId}`)

				io.to([
					`user:${userId}`,
					...parsed.data.peopleToAdd.map(p => `user:${p.id}`),
				]).emit('group:added', {
					groupId,
					groupName: parsed.data.groupName,
				})

				cb({ success: true, groupId })
			} catch (error) {
				console.error('Error creating group:', error)
				cb({ success: false, error: 'Internal Server Error' })
			}
		},
	)

	socket.on(
		'group:message:send',
		async (
			data,
			cb: ({ success, error }: { success: boolean; error?: string }) => void,
		) => {
			if (!cb || typeof cb !== 'function') {
				console.error('Callback function is not provided or is not a function')
				return
			}

			const parsed = sendGroupMessageSchema.safeParse(data)

			if (!parsed.success) {
				cb({ success: false, error: 'Invalid message data' })
				return
			}

			const userId = socket.data.id

			try {
				const checkIfInGroup = await db.query.groupUser.findFirst({
					where: and(
						eq(groupUser.groupId, parsed.data.groupId),
						eq(groupUser.userId, userId),
					),
				})

				if (!checkIfInGroup) {
					cb({ success: false, error: 'User is not a member of the group' })
					return
				}

				const messageId = crypto.randomUUID()

				const [newMessage] = await db
					.insert(message)
					.values({
						id: messageId,
						groupId: parsed.data.groupId,
						senderId: userId,
						type: parsed.data.type,
						text: parsed.data.text || null,
						imageUrl: parsed.data.imageUrl || null,
						imagePubId: parsed.data.imagePubId || null,
						read: false,
					})
					.returning()

				if (!newMessage) {
					cb({ success: false, error: 'Failed to create message' })
					return
				}

				const [senderInfoRow] = await db
					.select({
						userId: userProfile.userId,
						email: user.email,
						name: userProfile.name,
						imageUrl: userProfile.imageUrl,
						createdAt: userProfile.createdAt,
						updatedAt: userProfile.updatedAt,
						status: userProfile.status,
						about: userProfile.about,
						userPubId: userProfile.userPubId,
						previouslySetStatus: userProfile.previouslySetStatus,
						profileLastSeen: userProfile.lastSeen,
						lastSeenVisible: userPreferences.lastSeen,
					})
					.from(userProfile)
					.innerJoin(user, eq(userProfile.userId, user.id))
					.leftJoin(
						userPreferences,
						eq(userProfile.userId, userPreferences.userId),
					)
					.where(eq(userProfile.userId, userId))
					.limit(1)

				if (!senderInfoRow) {
					throw new Error('Failed to load sender profile')
				}

				const { profileLastSeen, lastSeenVisible, ...senderProfile } =
					senderInfoRow
				const senderInfo = {
					...senderProfile,
					lastSeen: lastSeenVisible ? profileLastSeen : undefined,
				}

				await Promise.all([
					db
						.update(group)
						.set({
							lastMessage:
								parsed.data.text ??
								(parsed.data.type === 'image' ? 'Image' : null),
							lastMessageAt: new Date(),
						})
						.where(eq(group.id, parsed.data.groupId)),
					db
						.update(groupUser)
						.set({
							unreadMessagesCount: sql`${groupUser.unreadMessagesCount} + 1`,
						})
						.where(
							and(
								eq(groupUser.groupId, parsed.data.groupId),
								ne(groupUser.userId, userId),
							),
						),
				])

				io.to(`group:${parsed.data.groupId}`).emit('group:message:received', {
					groupId: parsed.data.groupId,
					messageId,
				})

				socket
					.to(`group:${parsed.data.groupId}`)
					.emit('notification:new_group_message', {
						groupId: parsed.data.groupId,
						messageId,
					})

				io.to(`group:${parsed.data.groupId}`).emit(
					'message:new_group_messages',
					[{ ...newMessage, senderInfo }],
				)
				cb({
					success: true,
				})
			} catch (error) {
				console.error('Error sending group message:', error)
				cb({ success: false, error: 'Internal Server Error' })
			}
		},
	)

	socket.on(
		'group:clear-group-chat',
		async (
			data,
			cb: ({ success, error }: { success: boolean; error?: string }) => void,
		) => {
			if (!cb || typeof cb !== 'function') {
				console.error('Callback function is not provided or is not a function')
				return
			}

			const parsed = z
				.object({ groupId: z.string().trim().min(1) })
				.safeParse(data)

			if (!parsed.success) {
				cb({ success: false, error: 'Invalid data' })
				return
			}

			const { groupId } = parsed.data
			const userId = socket.data.id
			try {
				const checkIfAuthorized = await db.query.groupUser.findFirst({
					where: and(
						eq(groupUser.groupId, groupId),
						eq(groupUser.userId, userId),
						eq(groupUser.role, 'admin'),
					),
				})

				if (!checkIfAuthorized) {
					cb({
						success: false,
						error: 'You are not authorized to clear this group chat',
					})
					return
				}

				const groupImages = await db.query.message.findMany({
					where: eq(message.groupId, groupId),
					columns: {
						imagePubId: true,
					},
				})

				const imagePublicIds = groupImages
					.map(chatMessage => chatMessage.imagePubId)
					.filter((publicId): publicId is string => Boolean(publicId))

				const imageDeleteResults = await Promise.all(
					imagePublicIds.map(publicId =>
						cloudinary.uploader.destroy(publicId, {
							resource_type: 'image',
						}),
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

				await db.transaction(async tx => {
					await tx.delete(message).where(eq(message.groupId, groupId))
					await tx
						.update(group)
						.set({ lastMessage: null, lastMessageAt: null })
						.where(eq(group.id, groupId))
					await tx
						.update(groupUser)
						.set({ unreadMessagesCount: 0 })
						.where(eq(groupUser.groupId, groupId))
				})

				io.to(`group:${groupId}`).emit('group:chat:cleared', {
					groupId,
				})

				cb({
					success: true,
				})
			} catch (error) {
				console.error('Error clearing group chat:', error)
				cb({ success: false, error: 'Failed to clear group chat' })
			}
		},
	)

	socket.on(
		'group:update-description',
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
					description: z.string().trim(),
				})
				.safeParse(data)

			if (!parsed.success) {
				cb({ success: false, error: 'Invalid data' })
				return
			}

			const { groupId, description } = parsed.data
			const userId = socket.data.id

			try {
				const checkIfAuthorized = await db.query.groupUser.findFirst({
					where: and(
						eq(groupUser.groupId, groupId),
						eq(groupUser.userId, userId),
						eq(groupUser.role, 'admin'),
					),
				})

				if (!checkIfAuthorized) {
					cb({
						success: false,
						error: 'You are not authorized to update this group description',
					})
					return
				}

				await db
					.update(group)
					.set({ groupDescription: description })
					.where(eq(group.id, groupId))

				io.to(`group:${groupId}`).emit('group:description:updated', {
					groupId,
					description,
				})

				cb({
					success: true,
				})
			} catch (error) {
				console.error('Error updating group description:', error)
				cb({ success: false, error: 'Failed to update group description' })
			}
		},
	)

	socket.on(
		'group:delete-group-chat',
		async (
			data: { groupId: string },
			cb: ({ success, error }: { success: boolean; error?: string }) => void,
		) => {
			if (!cb || typeof cb !== 'function') {
				console.error('Callback function is not provided or is not a function')
				return
			}

			const parsed = z
				.object({ groupId: z.string().trim().min(1).max(100) })
				.safeParse(data)

			if (!parsed.success) {
				cb({ success: false, error: 'Invalid Credentials' })
				return
			}

			const { groupId } = parsed.data
			const userId = socket.data.id

			const userValid = await db.query.groupUser.findFirst({
				where: and(
					eq(groupUser.groupId, groupId),
					eq(groupUser.userId, userId),
					eq(groupUser.role, 'admin'),
				),
			})

			if (!userValid) {
				cb({ success: false, error: 'Unauthorized' })
				return
			}

			try {
				const groupMembers = await db.query.groupUser.findMany({
					where: eq(groupUser.groupId, groupId),
					columns: { userId: true },
				})

				const chatImages = await db.query.message.findMany({
					where: eq(message.groupId, groupId),
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

				await db.delete(group).where(eq(group.id, groupId))

				io.to(groupMembers.map(({ userId }) => `user:${userId}`)).emit(
					'group:deleted',
					{ groupId },
				)
				io.in(`group:${groupId}`).socketsLeave(`group:${groupId}`)

				cb({
					success: true,
				})
			} catch (error) {
				console.error('Failed to delete group:', error)

				cb({
					success: false,
					error: 'Failed to delete group',
				})
			}
		},
	)
	socket.on(
		'group:leave-group-chat',
		async (
			data: { groupId: string },
			cb: ({ success, error }: { success: boolean; error?: string }) => void,
		) => {
			if (!cb || typeof cb !== 'function') {
				console.error('Callback function is not provided or is not a function')
				return
			}

			const parsed = z
				.object({ groupId: z.string().trim().min(1).max(100) })
				.safeParse(data)

			if (!parsed.success) {
				cb({ success: false, error: 'Invalid Credentials' })
				return
			}

			const { groupId } = parsed.data
			const userId = socket.data.id

			const userValid = await db.query.groupUser.findFirst({
				where: and(
					eq(groupUser.groupId, groupId),
					eq(groupUser.userId, userId),
				),
			})

			if (!userValid) {
				cb({ success: false, error: 'Unauthorized' })
				return
			}

			try {
				const groupMembers = await db.query.groupUser.findMany({
					where: eq(groupUser.groupId, groupId),
					columns: { userId: true, role: true, createdAt: true },
				})
				const remainingMembers = groupMembers.filter(
					member => member.userId !== userId,
				)

				if (remainingMembers.length === 0) {
					const groupImages = await db.query.message.findMany({
						where: eq(message.groupId, groupId),
						columns: { imagePubId: true },
					})
					const imagePublicIds = groupImages
						.map(groupMessage => groupMessage.imagePubId)
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
						cb({ success: false, error: 'Failed to delete group images' })
						return
					}

					await db.delete(group).where(eq(group.id, groupId))
					io.to(groupMembers.map(({ userId }) => `user:${userId}`)).emit(
						'group:deleted',
						{ groupId },
					)
				} else {
					await db.transaction(async tx => {
						await tx
							.delete(groupUser)
							.where(
								and(
									eq(groupUser.groupId, groupId),
									eq(groupUser.userId, userId),
								),
							)
						await tx
							.update(group)
							.set({
								memberIds: sql`array_remove(${group.memberIds}, ${userId})`,
							})
							.where(eq(group.id, groupId))

						if (userValid.role === 'admin') {
							const nextAdmin = [...remainingMembers].sort(
								(first, second) =>
									first.createdAt.getTime() - second.createdAt.getTime(),
							)[0]
							if (nextAdmin) {
								await tx
									.update(groupUser)
									.set({ role: 'admin' })
									.where(
										and(
											eq(groupUser.groupId, groupId),
											eq(groupUser.userId, nextAdmin.userId),
										),
									)
							}
						}
					})

					io.to(remainingMembers.map(({ userId }) => `user:${userId}`)).emit(
						'group:member-left',
						{ groupId, userId },
					)
					io.to(`user:${userId}`).emit('group:left', { groupId })
				}

				io.in(`user:${userId}`).socketsLeave(`group:${groupId}`)

				cb({
					success: true,
				})
			} catch (error) {
				console.error('Failed to delete group:', error)

				cb({
					success: false,
					error: 'Failed to delete group',
				})
			}
		},
	)

	socket.on(
		'group:mark_as_read',
		async (
			data: { groupId: string },
			cb: ({ success, error }: { success: boolean; error?: string }) => void,
		) => {
			if (!cb || typeof cb !== 'function') {
				console.error('Callback function is not provided or is not a function')
				return
			}

			const parsed = z
				.object({ groupId: z.string().trim().min(1).max(100) })
				.safeParse(data)

			if (!parsed.success) {
				cb({ success: false, error: 'Invalid Credentials' })
				return
			}

			const userId = socket.data.id
			const { groupId } = parsed.data

			try {
				const checkIfInGroup = await db.query.groupUser.findFirst({
					where: and(
						eq(groupUser.groupId, groupId),
						eq(groupUser.userId, userId),
					),
				})

				if (!checkIfInGroup) {
					cb({ success: false, error: 'User is not a member of the group' })
					return
				}

				await db
					.update(groupUser)
					.set({ unreadMessagesCount: 0 })
					.where(
						and(eq(groupUser.groupId, groupId), eq(groupUser.userId, userId)),
					)

				cb({ success: true })
			} catch (error) {
				console.error('Failed to mark group as read:', error)
				cb({ success: false, error: 'Failed to mark group as read' })
			}
		},
	)
}
