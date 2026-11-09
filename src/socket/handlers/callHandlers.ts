import { Server, Socket } from 'socket.io'
import z from 'zod'
import { db } from '../../db/db.js'
import { and, eq, or } from 'drizzle-orm'
import { conversation, groupUser, userProfile } from '../../db/schemas/schema.js'
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk'
import { randomUUID } from 'node:crypto'

const apiKey = process.env.LIVEKIT_API_KEY
const secret = process.env.LIVEKIT_API_SECRET
const livekitHost = process.env.LIVEKIT_URL

const roomService =
	apiKey && secret && livekitHost
		? new RoomServiceClient(livekitHost, apiKey, secret)
		: null

export function registerCallHandlers(io: Server, socket: Socket) {
	socket.on(
		'group_video_call:join',
		async (
			data,
			cb: ({
				success,
				error,
				token,
				startedAt,
				serverNow,
			}: {
				success: boolean
				error?: string
				token?: string
				startedAt?: number
				serverNow?: number
			}) => void,
		) => {
			if (!cb || typeof cb !== 'function') {
				console.error('Callback function is not provided or is not a function')
				return
			}

			const parsed = z
				.object({
					userId: z.string().trim().min(1).max(100),
					groupId: z.string().trim().min(1).max(100),
				})
				.safeParse(data)

			if (!parsed.success) {
				cb({
					success: false,
					error: 'Invalid credentials',
				})
				return
			}

			const { userId, groupId } = parsed.data

			if (!apiKey || !secret || !roomService) {
				console.error('LiveKit API credentials are not configured')
				cb({
					success: false,
					error: 'Group calls are not configured on the server.',
				})
				return
			}

			const userIdReal = socket.data.id

			if (userIdReal !== userId) {
				cb({
					success: false,
					error: 'Invalid user id',
				})
				return
			}

			try {
				const groupMembership = await db.query.groupUser.findFirst({
					where: and(
						eq(groupUser.groupId, groupId),
						eq(groupUser.userId, userId),
					),
				})

				if (!groupMembership) {
					cb({ success: false, error: 'You are not in this group' })
					return
				}

				const userName = await db.query.userProfile.findFirst({
					where: eq(userProfile.userId, userId),
					columns: { name: true },
				})

				if (!userName) {
					cb({ success: false, error: 'Something went wrong' })
					return
				}

				const at = new AccessToken(apiKey, secret, {
					identity: userId,
					name: userName.name,
				})
				at.addGrant({ roomJoin: true, room: groupId })

				const token = await at.toJwt()
				const [existingRoom] = await roomService.listRooms([groupId])
				let callRoom = existingRoom

				if (!callRoom) {
					try {
						callRoom = await roomService.createRoom({ name: groupId })
					} catch (createError) {
						// Another participant may have created the same room concurrently.
						const [roomCreatedConcurrently] = await roomService.listRooms([
							groupId,
						])
						if (!roomCreatedConcurrently) throw createError
						callRoom = roomCreatedConcurrently
					}
				}

				const startedAt = Number(
					callRoom.creationTimeMs > 0n
						? callRoom.creationTimeMs
						: callRoom.creationTime * 1000n,
				)

				cb({ success: true, token, startedAt, serverNow: Date.now() })
			} catch (error) {
				console.error('Failed to create group call token:', error)
				cb({
					success: false,
					error: 'Something went wrong, try again later.',
				})
				return
			}
		},
	)
	socket.on(
		'group_call:join',
		async (
			data,
			cb: ({
				success,
				error,
				token,
				startedAt,
				serverNow,
			}: {
				success: boolean
				error?: string
				token?: string
				startedAt?: number
				serverNow?: number
			}) => void,
		) => {
			if (!cb || typeof cb !== 'function') {
				console.error('Callback function is not provided or is not a function')
				return
			}

			const parsed = z
				.object({
					userId: z.string().trim().min(1).max(100),
					groupId: z.string().trim().min(1).max(100),
				})
				.safeParse(data)

			if (!parsed.success) {
				cb({
					success: false,
					error: 'Invalid credentials',
				})
				return
			}

			const { userId, groupId } = parsed.data

			if (!apiKey || !secret || !roomService) {
				console.error('LiveKit API credentials are not configured')
				cb({
					success: false,
					error: 'Group calls are not configured on the server.',
				})
				return
			}

			const userIdReal = socket.data.id

			if (userIdReal !== userId) {
				cb({
					success: false,
					error: 'Invalid user id',
				})
				return
			}

			try {
				const groupMembership = await db.query.groupUser.findFirst({
					where: and(
						eq(groupUser.groupId, groupId),
						eq(groupUser.userId, userId),
					),
				})

				if (!groupMembership) {
					cb({ success: false, error: 'You are not in this group' })
					return
				}

				const userName = await db.query.userProfile.findFirst({
					where: eq(userProfile.userId, userId),
					columns: { name: true },
				})

				if (!userName) {
					cb({ success: false, error: 'Something went wrong' })
					return
				}

				const at = new AccessToken(apiKey, secret, {
					identity: userId,
					name: userName.name,
				})
				at.addGrant({ roomJoin: true, room: groupId })

				const token = await at.toJwt()
				const [existingRoom] = await roomService.listRooms([groupId])
				let callRoom = existingRoom

				if (!callRoom) {
					try {
						callRoom = await roomService.createRoom({ name: groupId })
					} catch (createError) {
						// Another participant may have created the same room concurrently.
						const [roomCreatedConcurrently] = await roomService.listRooms([
							groupId,
						])
						if (!roomCreatedConcurrently) throw createError
						callRoom = roomCreatedConcurrently
					}
				}

				const startedAt = Number(
					callRoom.creationTimeMs > 0n
						? callRoom.creationTimeMs
						: callRoom.creationTime * 1000n,
				)

				cb({ success: true, token, startedAt, serverNow: Date.now() })
			} catch (error) {
				console.error('Failed to create group call token:', error)
				cb({
					success: false,
					error: 'Something went wrong, try again later.',
				})
				return
			}
		},
	)
	socket.on(
		'audio_call:join',
		async (
			data,
			cb: ({
				success,
				error,
				token,
				startedAt,
				serverNow,
			}: {
				success: boolean
				error?: string
				token?: string
				startedAt?: number
				serverNow?: number
			}) => void,
		) => {
			if (!cb || typeof cb !== 'function') {
				console.error('Callback function is not provided or is not a function')
				return
			}

			const parsed = z
				.object({
					userId: z.string().trim().min(1).max(100),
					conversationId: z.string().trim().min(1).max(100),
				})
				.safeParse(data)

			if (!parsed.success) {
				cb({
					success: false,
					error: 'Invalid credentials',
				})
				return
			}

			const { userId, conversationId } = parsed.data

			if (!apiKey || !secret || !roomService) {
				console.error('LiveKit API credentials are not configured')
				cb({
					success: false,
					error: 'Calls are not configured on the server.',
				})
				return
			}

			const userIdReal = socket.data.id

			if (userIdReal !== userId) {
				cb({
					success: false,
					error: 'Invalid user id',
				})
				return
			}

			try {
				const chat = await db.query.conversation.findFirst({
					where: and(
						eq(conversation.id, conversationId),
						or(
							eq(conversation.userOneId, userId),
							eq(conversation.userTwoId, userId),
						),
					),
				})

				if (!chat) {
					cb({ success: false, error: 'You are not part of this conversation' })
					return
				}

				const recipientId =
					chat.userOneId === userId ? chat.userTwoId : chat.userOneId
				const [callerProfile, recipientProfile] = await Promise.all([
					db.query.userProfile.findFirst({
						where: eq(userProfile.userId, userId),
						columns: { name: true },
					}),
					db.query.userProfile.findFirst({
						where: eq(userProfile.userId, recipientId),
						columns: { name: true },
					}),
				])

				if (!callerProfile || !recipientProfile) {
					cb({ success: false, error: 'Could not load call participants' })
					return
				}

				const [recipientSocket] = await io
					.in(`user:${recipientId}`)
					.fetchSockets()

				if (!recipientSocket) {
					cb({ success: false, error: 'The user is unavailable' })
					return
				}

				const callId = randomUUID()
				const decision = await new Promise<'accepted' | 'rejected' | 'timeout'>(
					resolve => {
						io.to(recipientSocket.id)
							.timeout(30_000)
							.emit(
								'call:incoming',
								{
									callId,
									conversationId,
									callerId: userId,
									callerName: callerProfile.name,
									type: 'audio',
									timeoutMs: 30_000,
								},
								(error: Error | null, responses: unknown[]) => {
									if (error) {
										resolve('timeout')
										return
									}

									const response = responses?.[0] as
										| { status?: string }
										| undefined
									resolve(
										response?.status === 'accepted' ? 'accepted' : 'rejected',
									)
								},
							)
					},
				)

				if (decision !== 'accepted') {
					const error =
						decision === 'timeout'
							? 'The user did not answer the call.'
							: 'The user declined the call.'
					socket.emit('audio_call:failed', { conversationId, error })
					cb({
						success: false,
						error,
					})
					return
				}

				const at = new AccessToken(apiKey, secret, {
					identity: userId,
					name: callerProfile.name,
				})
				const roomName = `direct-audio-call:${conversationId}`
				at.addGrant({ roomJoin: true, room: roomName })

				const token = await at.toJwt()
				const [existingRoom] = await roomService.listRooms([roomName])
				let callRoom = existingRoom

				if (!callRoom) {
					try {
						callRoom = await roomService.createRoom({
							name: roomName,
							maxParticipants: 2,
							emptyTimeout: 10,
						})
					} catch (createError) {
						// Another participant may have created the same room concurrently.
						const [roomCreatedConcurrently] = await roomService.listRooms([
							roomName,
						])
						if (!roomCreatedConcurrently) throw createError
						callRoom = roomCreatedConcurrently
					}
				}

				const startedAt = Number(
					callRoom.creationTimeMs > 0n
						? callRoom.creationTimeMs
						: callRoom.creationTime * 1000n,
				)

				const recipientToken = new AccessToken(apiKey, secret, {
					identity: recipientId,
					name: recipientProfile.name,
				})
				recipientToken.addGrant({ roomJoin: true, room: roomName })
				io.to(recipientSocket.id).emit('audio_call:accepted', {
					callId,
					conversationId,
					participantName: callerProfile.name,
					token: await recipientToken.toJwt(),
					startedAt,
					serverNow: Date.now(),
				})

				const serverNow = Date.now()
				const callCredentials = {
					token,
					startedAt,
					serverNow,
					participantName: recipientProfile.name,
				}
				// Keep credentials available through an event if the acknowledgement
				// is lost while the caller's socket is recovering.
				socket.emit('audio_call:ready', { conversationId, ...callCredentials })
				cb({ success: true, ...callCredentials })
			} catch (error) {
				console.error('Failed to create audio call token:', error)
				cb({
					success: false,
					error: 'Something went wrong, try again later.',
				})
				return
			}
		},
	)
	socket.on(
		'video_call:join',
		async (
			data,
			cb: ({
				success,
				error,
				token,
				startedAt,
				serverNow,
			}: {
				success: boolean
				error?: string
				token?: string
				startedAt?: number
				serverNow?: number
			}) => void,
		) => {
			if (!cb || typeof cb !== 'function') {
				console.error('Callback function is not provided or is not a function')
				return
			}

			const parsed = z
				.object({
					userId: z.string().trim().min(1).max(100),
					conversationId: z.string().trim().min(1).max(100),
				})
				.safeParse(data)

			if (!parsed.success) {
				cb({
					success: false,
					error: 'Invalid credentials',
				})
				return
			}

			const { userId, conversationId } = parsed.data

			if (!apiKey || !secret || !roomService) {
				console.error('LiveKit API credentials are not configured')
				cb({
					success: false,
					error: 'Calls are not configured on the server.',
				})
				return
			}

			const userIdReal = socket.data.id

			if (userIdReal !== userId) {
				cb({
					success: false,
					error: 'Invalid user id',
				})
				return
			}

			try {
				const chat = await db.query.conversation.findFirst({
					where: and(
						eq(conversation.id, conversationId),
						or(
							eq(conversation.userOneId, userId),
							eq(conversation.userTwoId, userId),
						),
					),
				})

				if (!chat) {
					cb({ success: false, error: 'You are not part of this conversation' })
					return
				}

				const recipientId =
					chat.userOneId === userId ? chat.userTwoId : chat.userOneId
				const [callerProfile, recipientProfile] = await Promise.all([
					db.query.userProfile.findFirst({
						where: eq(userProfile.userId, userId),
						columns: { name: true },
					}),
					db.query.userProfile.findFirst({
						where: eq(userProfile.userId, recipientId),
						columns: { name: true },
					}),
				])

				if (!callerProfile || !recipientProfile) {
					cb({ success: false, error: 'Could not load call participants' })
					return
				}

				const [recipientSocket] = await io
					.in(`user:${recipientId}`)
					.fetchSockets()

				if (!recipientSocket) {
					cb({ success: false, error: 'The user is unavailable' })
					return
				}

				const callId = randomUUID()
				const decision = await new Promise<'accepted' | 'rejected' | 'timeout'>(
					resolve => {
						io.to(recipientSocket.id)
							.timeout(30_000)
							.emit(
								'call:incoming',
								{
									callId,
									conversationId,
									callerId: userId,
									callerName: callerProfile.name,
									type: 'video',
									timeoutMs: 30_000,
								},
								(error: Error | null, responses: unknown[]) => {
									if (error) {
										resolve('timeout')
										return
									}

									const response = responses?.[0] as
										| { status?: string }
										| undefined
									resolve(
										response?.status === 'accepted' ? 'accepted' : 'rejected',
									)
								},
							)
					},
				)

				if (decision !== 'accepted') {
					cb({
						success: false,
						error:
							decision === 'timeout'
								? 'The user did not answer the call.'
								: 'The user declined the call.',
					})
					return
				}

				const at = new AccessToken(apiKey, secret, {
					identity: userId,
					name: callerProfile.name,
				})
				const roomName = `direct-call:${conversationId}`
				at.addGrant({ roomJoin: true, room: roomName })

				const token = await at.toJwt()
				const [existingRoom] = await roomService.listRooms([roomName])
				let callRoom = existingRoom

				if (!callRoom) {
					try {
						callRoom = await roomService.createRoom({
							name: roomName,
							maxParticipants: 2,
							emptyTimeout: 10,
						})
					} catch (createError) {
						// Another participant may have created the same room concurrently.
						const [roomCreatedConcurrently] = await roomService.listRooms([
							roomName,
						])
						if (!roomCreatedConcurrently) throw createError
						callRoom = roomCreatedConcurrently
					}
				}

				const startedAt = Number(
					callRoom.creationTimeMs > 0n
						? callRoom.creationTimeMs
						: callRoom.creationTime * 1000n,
				)

				const recipientToken = new AccessToken(apiKey, secret, {
					identity: recipientId,
					name: recipientProfile.name,
				})
				recipientToken.addGrant({ roomJoin: true, room: roomName })
				io.to(recipientSocket.id).emit('video_call:accepted', {
					callId,
					conversationId,
					token: await recipientToken.toJwt(),
					startedAt,
					serverNow: Date.now(),
				})

				const serverNow = Date.now()
				const callCredentials = { token, startedAt, serverNow }
				// Keep credentials available through an event if the acknowledgement
				// is lost while the caller's socket is recovering.
				socket.emit('video_call:ready', { conversationId, ...callCredentials })
				cb({ success: true, ...callCredentials })
			} catch (error) {
				console.error('Failed to create call token:', error)
				cb({
					success: false,
					error: 'Something went wrong, try again later.',
				})
				return
			}
		},
	)
}
