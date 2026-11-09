import { Server, Socket } from 'socket.io'
import z from 'zod'
import { db } from '../../db/db.js'
import { and, eq, isNull, or } from 'drizzle-orm'
import {
	call,
	callParticipant,
	conversation,
	groupUser,
	userProfile,
} from '../../db/schemas/schema.js'
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk'
import { randomUUID } from 'node:crypto'

const apiKey = process.env.LIVEKIT_API_KEY
const secret = process.env.LIVEKIT_API_SECRET
const livekitHost = process.env.LIVEKIT_URL

const roomService =
	apiKey && secret && livekitHost
		? new RoomServiceClient(livekitHost, apiKey, secret)
		: null

type CallParticipantProfile = { name: string; imageUrl: string | null }

async function saveDirectCall({
	io,
	callId,
	conversationId,
	initiatorId,
	recipientId,
	initiator,
	recipient,
	callType,
	startedAt,
	result,
}: {
	io: Server
	callId: string
	conversationId: string
	initiatorId: string
	recipientId: string
	initiator: CallParticipantProfile
	recipient: CallParticipantProfile
	callType: 'audio' | 'video'
	startedAt: Date
	result: 'accepted' | 'declined' | 'missed'
}) {
	await db.transaction(async tx => {
		await tx.insert(call).values({
			id: callId,
			conversationId,
			initiatorId,
			callType,
			startedAt,
			endedAt: result === 'accepted' ? null : new Date(),
		})
		await tx.insert(callParticipant).values([
			{
				id: randomUUID(),
				callId,
				userId: initiatorId,
				name: initiator.name,
				imageUrl: initiator.imageUrl,
				role: 'initiator',
				status: result === 'accepted' ? 'accepted' : 'outgoing',
			},
			{
				id: randomUUID(),
				callId,
				userId: recipientId,
				name: recipient.name,
				imageUrl: recipient.imageUrl,
				role: 'participant',
				status:
					result === 'accepted'
						? 'accepted'
						: result === 'missed'
							? 'missed'
							: 'declined',
			},
		])
	})
	io.to(`user:${initiatorId}`).to(`user:${recipientId}`).emit('call:history:updated')
}

async function ensureGroupCallParticipant({
	groupId,
	userId,
	profile,
	callType,
	startedAt,
}: {
	groupId: string
	userId: string
	profile: CallParticipantProfile
	callType: 'audio' | 'video'
	startedAt: Date
}) {
	let activeCall = await db.query.call.findFirst({
		where: and(eq(call.groupId, groupId), isNull(call.endedAt)),
	})

	if (!activeCall) {
		await db
			.insert(call)
			.values({
				id: randomUUID(),
				groupId,
				initiatorId: userId,
				callType,
				startedAt,
			})
			.onConflictDoNothing()
		activeCall = await db.query.call.findFirst({
			where: and(eq(call.groupId, groupId), isNull(call.endedAt)),
		})
	}

	if (!activeCall) throw new Error('Could not create a group call history record')

	await db
		.insert(callParticipant)
		.values({
			id: randomUUID(),
			callId: activeCall.id,
			userId,
			name: profile.name,
			imageUrl: profile.imageUrl,
			role: activeCall.initiatorId === userId ? 'initiator' : 'participant',
			status: 'joined',
			joinedAt: new Date(),
		})
		.onConflictDoUpdate({
			target: [callParticipant.callId, callParticipant.userId],
			set: { status: 'joined', joinedAt: new Date(), leftAt: null },
		})

	return activeCall.id
}

export function registerCallHandlers(io: Server, socket: Socket) {
	socket.on('call:leave', async (data, cb?: (response: { success: boolean }) => void) => {
		const parsed = z.object({
			callId: z.string().trim().min(1).max(100),
			userId: z.string().trim().min(1).max(100),
		}).safeParse(data)
		if (!parsed.success || parsed.data.userId !== socket.data.id) {
			cb?.({ success: false })
			return
		}

		try {
			const { callId, userId } = parsed.data
			await db.update(callParticipant)
				.set({ status: 'left', leftAt: new Date() })
				.where(and(eq(callParticipant.callId, callId), eq(callParticipant.userId, userId)))

			const participants = await db.query.callParticipant.findMany({
				where: eq(callParticipant.callId, callId),
				columns: { status: true },
			})
			if (participants.length > 0 && participants.every(({ status }) => status === 'left' || status === 'declined' || status === 'missed' || status === 'outgoing')) {
				await db.update(call).set({ endedAt: new Date() }).where(and(eq(call.id, callId), isNull(call.endedAt)))
			}
			cb?.({ success: true })
		} catch (error) {
			console.error('Failed to record call participant leaving:', error)
			cb?.({ success: false })
		}
	})

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
				callId,
			}: {
				success: boolean
				error?: string
				token?: string
				startedAt?: number
				serverNow?: number
				callId?: string
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
					columns: { name: true, imageUrl: true },
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
				if (!existingRoom) {
					await db
						.update(call)
						.set({ endedAt: new Date() })
						.where(and(eq(call.groupId, groupId), isNull(call.endedAt)))
				}

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
				const callId = await ensureGroupCallParticipant({
					groupId,
					userId,
					profile: userName,
					callType: 'video',
					startedAt: new Date(startedAt),
				})

				cb({ success: true, token, startedAt, serverNow: Date.now(), callId })
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
				callId,
			}: {
				success: boolean
				error?: string
				token?: string
				startedAt?: number
				serverNow?: number
				callId?: string
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
					columns: { name: true, imageUrl: true },
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
				if (!existingRoom) {
					await db
						.update(call)
						.set({ endedAt: new Date() })
						.where(and(eq(call.groupId, groupId), isNull(call.endedAt)))
				}

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
				const callId = await ensureGroupCallParticipant({
					groupId,
					userId,
					profile: userName,
					callType: 'audio',
					startedAt: new Date(startedAt),
				})

				cb({ success: true, token, startedAt, serverNow: Date.now(), callId })
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
				callId?: string
				participantName?: string
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
						columns: { name: true, imageUrl: true },
					}),
					db.query.userProfile.findFirst({
						where: eq(userProfile.userId, recipientId),
						columns: { name: true, imageUrl: true },
					}),
				])

				if (!callerProfile || !recipientProfile) {
					cb({ success: false, error: 'Could not load call participants' })
					return
				}

				const [recipientSocket] = await io
					.in(`user:${recipientId}`)
					.fetchSockets()
				const callId = randomUUID()
				const inviteStartedAt = new Date()

				if (!recipientSocket) {
					await saveDirectCall({
						io,
						callId,
						conversationId,
						initiatorId: userId,
						recipientId,
						initiator: callerProfile,
						recipient: recipientProfile,
						callType: 'audio',
						startedAt: inviteStartedAt,
						result: 'missed',
					})
					cb({ success: false, error: 'The user is unavailable' })
					return
				}

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
										response?.status === 'accepted'
											? 'accepted'
											: response?.status === 'timeout'
												? 'timeout'
												: 'rejected',
									)
								},
							)
					},
				)

				if (decision !== 'accepted') {
					await saveDirectCall({
						io,
						callId,
						conversationId,
						initiatorId: userId,
						recipientId,
						initiator: callerProfile,
						recipient: recipientProfile,
						callType: 'audio',
						startedAt: inviteStartedAt,
						result: decision === 'timeout' ? 'missed' : 'declined',
					})
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
				await saveDirectCall({
					io,
					callId,
					conversationId,
					initiatorId: userId,
					recipientId,
					initiator: callerProfile,
					recipient: recipientProfile,
					callType: 'audio',
					startedAt: new Date(startedAt),
					result: 'accepted',
				})

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
					callId,
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
				callId?: string
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
						columns: { name: true, imageUrl: true },
					}),
					db.query.userProfile.findFirst({
						where: eq(userProfile.userId, recipientId),
						columns: { name: true, imageUrl: true },
					}),
				])

				if (!callerProfile || !recipientProfile) {
					cb({ success: false, error: 'Could not load call participants' })
					return
				}

				const [recipientSocket] = await io
					.in(`user:${recipientId}`)
					.fetchSockets()
				const callId = randomUUID()
				const inviteStartedAt = new Date()

				if (!recipientSocket) {
					await saveDirectCall({
						io,
						callId,
						conversationId,
						initiatorId: userId,
						recipientId,
						initiator: callerProfile,
						recipient: recipientProfile,
						callType: 'video',
						startedAt: inviteStartedAt,
						result: 'missed',
					})
					cb({ success: false, error: 'The user is unavailable' })
					return
				}

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
										response?.status === 'accepted'
											? 'accepted'
											: response?.status === 'timeout'
												? 'timeout'
												: 'rejected',
									)
								},
							)
					},
				)

				if (decision !== 'accepted') {
					await saveDirectCall({
						io,
						callId,
						conversationId,
						initiatorId: userId,
						recipientId,
						initiator: callerProfile,
						recipient: recipientProfile,
						callType: 'video',
						startedAt: inviteStartedAt,
						result: decision === 'timeout' ? 'missed' : 'declined',
					})
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
				await saveDirectCall({
					io,
					callId,
					conversationId,
					initiatorId: userId,
					recipientId,
					initiator: callerProfile,
					recipient: recipientProfile,
					callType: 'video',
					startedAt: new Date(startedAt),
					result: 'accepted',
				})

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
				const callCredentials = { callId, token, startedAt, serverNow }
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
