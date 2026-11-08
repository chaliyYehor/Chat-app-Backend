import { Server, Socket } from 'socket.io'
import z from 'zod'
import { db } from '../../db/db.js'
import { and, eq } from 'drizzle-orm'
import { groupUser, userProfile } from '../../db/schemas/schema.js'
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk'

const apiKey = process.env.LIVEKIT_API_KEY
const secret = process.env.LIVEKIT_API_SECRET
const livekitHost = process.env.LIVEKIT_URL

const roomService =
	apiKey && secret && livekitHost
		? new RoomServiceClient(livekitHost, apiKey, secret)
		: null

export function registerCallHandlers(io: Server, socket: Socket) {
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
				cb({ success: false, error: 'Group calls are not configured on the server.' })
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
						const [roomCreatedConcurrently] = await roomService.listRooms([groupId])
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
}
