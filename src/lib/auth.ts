import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db } from '../db/db.js'
import { Resend } from 'resend'
import ResetPasswordEmail from '../emails/reset-password.js'
import VerificationEmail from '../emails/verification.js'
import { userProfile } from '../db/schemas/schema.js'
import { randomInt } from 'crypto'

const resend = new Resend(process.env.RESEND_API_KEY)

const allowedOrigins = [
	process.env.CLIENT_URL || 'http://localhost:5173',
	process.env.VERCEL_CLIENT_URL as string,
]

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: 'pg',
	}),

	databaseHooks: {
		user: {
			create: {
				after: async user => {
					await db.insert(userProfile).values({
						userId: user.id,
						userPubId: String(randomInt(1000, 100000)),
						name: user.name,
						status: 'online'
					})
				}
			}
		}
	},

	trustedOrigins: allowedOrigins,

	emailAndPassword: {
		enabled: true,
		requireEmailVerification: true,

		sendResetPassword: async ({ user, url }) => {
			const { error } = await resend.emails.send({
				from: `Chat App <${process.env.RESEND_EMAIL as string}>`,
				to: user.email,
				subject: 'Reset your password',
				react: ResetPasswordEmail({ username: user.name, resetUrl: url }),
			})
			if (error) {
				console.error(error)
				throw new Error('Failed to send password reset email')
			}
		},
	},

	baseURL: process.env.BETTER_AUTH_URL,

	socialProviders: {
		google: {
			clientId: process.env.GOOGLE_CLIENT_ID as string,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
		},
		github: {
			clientId: process.env.GITHUB_CLIENT_ID as string,
			clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
		},
	},

	account: {
		accountLinking: {
			enabled: true,
			trustedProviders: ['google', 'github'],
		},
	},

	emailVerification: {
		sendVerificationEmail: async ({ user, url }) => {
			const { error } = await resend.emails.send({
				from: `Chat App <${process.env.RESEND_EMAIL as string}>`,
				to: user.email,
				subject: 'Verify your email',
				react: VerificationEmail({ username: user.name, verifyUrl: url }),
			})

			if (error) {
				console.error(error)
				throw new Error('Failed to send verification email')
			}
		},
		sendOnSignUp: true,
	},
})
