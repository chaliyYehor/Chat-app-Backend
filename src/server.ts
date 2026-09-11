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

app.use(errorMiddleware)

app.use(
	cors({
		origin: allowedOrigins,
		credentials: true,
	}),
)

app.use(express.json())
app.use(xss())

app.get('/health', (req, res) => {
	res.status(StatusCodes.OK).send()
})

server.listen(PORT, () => {
	console.log(`Server is listening on port ${PORT}`)
})
