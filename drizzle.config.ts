/// <referencess types="node" />

import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

if (!process.env.DATABASE_URL) {
	throw new Error('DATABASE_URL is not set in the .env file')
}

export default defineConfig({
	schema: './src/db/schemas/schema.ts',
	out: './migrations',
	dialect: 'postgresql',
	dbCredentials: {
		url: process.env.DATABASE_URL,
	},
})
