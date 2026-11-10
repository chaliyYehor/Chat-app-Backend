import type { Socket } from 'socket.io'

type RateLimit = { max: number; windowMs: number }
type RateWindow = { timestamps: number[]; lastSeen: number }
type UserRateState = { lastSeen: number; windows: Map<string, RateWindow> }

const DEFAULT_LIMIT: RateLimit = { max: 300, windowMs: 10_000 }
const EVENT_LIMITS: Record<string, RateLimit> = {
	'message:send': { max: 30, windowMs: 10_000 },
	'group:message:send': { max: 30, windowMs: 10_000 },
	'chat:create-chat': { max: 10, windowMs: 60_000 },
	'group:create-group': { max: 10, windowMs: 60_000 },
	'audio_call:join': { max: 10, windowMs: 30_000 },
	'video_call:join': { max: 10, windowMs: 30_000 },
	'group_call:join': { max: 10, windowMs: 30_000 },
	'group_video_call:join': { max: 10, windowMs: 30_000 },
	'chat:delete-chat': { max: 20, windowMs: 10_000 },
	'chat:clear-chat': { max: 20, windowMs: 10_000 },
	'group:clear-group-chat': { max: 20, windowMs: 10_000 },
	'group:delete-group-chat': { max: 20, windowMs: 10_000 },
	'group:leave-group-chat': { max: 20, windowMs: 10_000 },
}

const userRateState = new Map<string, UserRateState>()

const cleanupTimer = setInterval(() => {
	const inactiveBefore = Date.now() - 5 * 60_000
	for (const [userId, state] of userRateState) {
		if (state.lastSeen < inactiveBefore) userRateState.delete(userId)
	}
}, 60_000)
cleanupTimer.unref()

function recordWithinLimit(
	state: UserRateState,
	key: string,
	limit: RateLimit,
	now: number,
) {
	let window = state.windows.get(key)
	if (!window) {
		window = { timestamps: [], lastSeen: now }
		state.windows.set(key, window)
	}

	window.lastSeen = now
	while (window.timestamps.length && window.timestamps[0] <= now - limit.windowMs) {
		window.timestamps.shift()
	}

	if (window.timestamps.length >= limit.max) {
		return Math.max(1, window.timestamps[0] + limit.windowMs - now)
	}

	window.timestamps.push(now)
	return 0
}

export function registerSocketRateLimit(socket: Socket) {
	const userId = socket.data.id as string | undefined
	if (!userId) return

	socket.on('error', error => {
		if (error instanceof Error && error.message === 'SOCKET_RATE_LIMITED') return
		console.error('Socket event error:', error)
	})

	socket.use((packet, next) => {
		const event = packet[0]
		if (typeof event !== 'string') return next()

		const now = Date.now()
		let state = userRateState.get(userId)
		if (!state) {
			state = { lastSeen: now, windows: new Map() }
			userRateState.set(userId, state)
		}
		state.lastSeen = now

		const globalRetry = recordWithinLimit(state, '*', DEFAULT_LIMIT, now)
		const eventLimit = EVENT_LIMITS[event]
		const eventRetry = eventLimit
			? recordWithinLimit(state, event, eventLimit, now)
			: 0
		const retryAfterMs = Math.max(globalRetry, eventRetry)

		if (retryAfterMs > 0) {
			const acknowledgement = packet.at(-1)
			if (typeof acknowledgement === 'function') {
				acknowledgement({
					success: false,
					error: 'Rate limit exceeded',
					retryAfterMs,
				})
			}
			return next(new Error('SOCKET_RATE_LIMITED'))
		}

		next()
	})
}
