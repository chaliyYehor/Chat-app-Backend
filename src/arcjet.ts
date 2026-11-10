import arcjet, { detectBot, shield, slidingWindow } from '@arcjet/node'
import { NextFunction, Request, Response } from 'express'

const arcjetKey = process.env.ARCJET_KEY

if (!arcjetKey) {
	throw new Error('ARCJET_KEY is not defined in the environment variables.')
}

export const httpArcjet = arcjetKey
	? arcjet({
			key: arcjetKey,
			rules: [
				shield({ mode: 'LIVE' }),
				detectBot({
					mode: 'LIVE',
					allow: ['CATEGORY:SEARCH_ENGINE', 'CATEGORY:PREVIEW'],
				}),
				slidingWindow({ mode: 'LIVE', interval: '20s', max: 30 }),
			],
		})
	: null

export const wsArcjet = arcjetKey
	? arcjet({
			key: arcjetKey,
			rules: [
				shield({ mode: 'LIVE' }),
				detectBot({
					mode: 'LIVE',
					allow: ['CATEGORY:SEARCH_ENGINE', 'CATEGORY:PREVIEW'],
				}),
				slidingWindow({ mode: 'LIVE', interval: '2s', max: 8 }),
			],
		})
	: null

export function arcjetSecurityMiddleware() {
	return async (req: Request, res: Response, next: NextFunction) => {
		if (!httpArcjet) return next()

		try {
			const decision = await httpArcjet.protect(req)

			if (decision.isDenied()) {
				if (decision.reason.isRateLimit()) {
					return res.status(429).json({ error: 'Too many requests.' })
				}
				console.log(decision)
				return res.status(403).json({ error: 'Forbidden.' })
			}

			if (decision.isErrored()) {
				console.error('Arcjet could not evaluate HTTP request:', decision.reason)
				return next()
			}
		} catch (error) {
			console.error('Error in Arcjet security middleware:', error)
			return next()
		}

		next()
	}
}
