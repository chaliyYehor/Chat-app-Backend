import cron from 'node-cron'

const SERVER_PORT = Number(process.env.PORT) || 5000
const SERVER_URL = process.env.SERVER_URL || `http://localhost:${SERVER_PORT}`

export default cron.schedule('*/14 * * * *', async () => {
	try {
		const response = await fetch(`${SERVER_URL}/health`)

		console.log(`Health check: ${response.status}`)
	} catch (error) {
		console.error('Health check failed:', error)
	}
})
