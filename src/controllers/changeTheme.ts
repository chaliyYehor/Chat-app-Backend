import { NextFunction, Request, Response } from 'express'
import { db } from '../db/db.js'
import z from 'zod'
import { BadRequestError } from '../errors/badRequest.js'
import { userProfile } from '../db/schemas/schema.js'
import { eq } from 'drizzle-orm'

export const changeThemeHandler = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	const userId = req.session.user.id
	const result = z
		.object({
			theme: z.enum(['dark', 'light']),
		})
		.safeParse(req.body)

	if (!result.success) {
		return next(new BadRequestError('Invalid Theme'))
	}

	const { theme } = result.data

	try {
		await db.update(userProfile).set({ theme }).where(eq(userProfile.userId, userId))
		res.status(200).json({ message: 'Theme updated successfully' })
	} catch (error) {
		return next(error)
	}
}
