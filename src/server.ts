import express from 'express'
import http from 'http'
import 'dotenv/config'
import { Server } from 'socket.io'
import cors from 'cors'
import { xss } from 'express-xss-sanitizer'
import helmet from 'helmet'
import { StatusCodes } from 'http-status-codes'
import { errorMiddleware } from './middleware/errorHandlingMiddleware.js'

const PORT = process.env.PORT
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173'

const app = express()
const server = http.createServer(app)

const allowedOrigins = [CLIENT_URL]

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

app.get('/', (req, res) => {
	res.status(StatusCodes.OK).send()
})

server.listen(PORT, () => {
	console.log(`Server is listening on port ${PORT}`)
})
