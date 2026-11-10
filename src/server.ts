import cors from 'cors'
import 'dotenv/config'
import express, { NextFunction, Request, Response } from 'express'
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
import { configureSocket } from './socket/index.js'
import { LiveKitAPI } from 'livekit-server-sdk'
import callsRouter from './routers/callsRouter.js'
import swaggerUi from 'swagger-ui-express'
import { readFileSync } from 'node:fs'
import { arcjetSecurityMiddleware, wsArcjet } from './arcjet.js'

const PORT = Number(process.env.PORT) || 5000
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173'
const VERCEL_CLIENT_URL = process.env.VERCEL_CLIENT_URL as string

const app = express()
const server = http.createServer(app)

const allowedOrigins = [CLIENT_URL, VERCEL_CLIENT_URL]

const host = process.env.LIVEKIT_URL
const apiKey = process.env.LIVEKIT_API_KEY
const secret = process.env.LIVEKIT_API_SECRET

new LiveKitAPI({
	host,
	apiKey,
	secret,
})

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

app.use(arcjetSecurityMiddleware())

app.use(express.json())
app.use(xss())

const docsEnabled =
	process.env.NODE_ENV !== 'production' || process.env.ENABLE_DOCS === 'true'
if (docsEnabled) {
	const openApiYaml = readFileSync(
		new URL('../docs/openapi.yaml', import.meta.url),
		'utf8',
	)
	app.get('/docs/openapi.yaml', (_req, res) => {
		res.type('application/yaml').send(openApiYaml)
	})
	app.use(
		'/docs',
		(_req: Request, res: Response, next: NextFunction) => {
			res.setHeader(
				'Content-Security-Policy',
				"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'",
			)
			next()
		},
		swaggerUi.serve,
		swaggerUi.setup(null, {
			swaggerUrl: '/docs/openapi.yaml',
			customSiteTitle: 'Pulse API',
		}),
	)
}

app.all('/api/auth/*splat', toNodeHandler(auth))

io.use(async (socket, next) => {
	if (wsArcjet) {
		try {
			const decision = await wsArcjet.protect(socket.request)

			if (decision.isDenied()) {
				const message = decision.reason.isRateLimit()
					? 'Connection rate limit exceeded.'
					: 'Connection rejected by security policy.'
				return next(new Error(message))
			}

			if (decision.isErrored()) {
				console.error('Arcjet could not evaluate WebSocket connection:', decision.reason)
			}
		} catch (e) {
			console.error('WS upgrade protection error', e)
		}
	}

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

configureSocket(io)

app.use('/api/user', authenticationMiddleware, userInfoRouter)
app.use('/api/chat', authenticationMiddleware, messagesRouter)
app.use('/api/calls', authenticationMiddleware, callsRouter)

app.get('/health', (req, res) => {
	res.status(StatusCodes.OK).send()
})

app.use(errorMiddleware)

server.listen(PORT, () => {
	console.log(`Server is listening on port ${PORT}`)
})
