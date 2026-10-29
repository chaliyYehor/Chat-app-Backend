import { eq } from 'drizzle-orm'
import { NextFunction, Request, Response } from 'express'
import z from 'zod'
import { db } from '../../db/db.js'
import { userPreferences } from '../../db/schemas/schema.js'
import { BadRequestError } from '../../errors/badRequest.js'

export const changeUserPreferences = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	const userId = req.session.user.id

	const result = z
		.object({
			type: z.enum([
				'typingSounds',
				'messageSounds',
				'lastSeen',
				'readReceipts',
			]),
			value: z.boolean(),
		})
		.safeParse(req.body)

	if (!result.success) {
		return next(new BadRequestError('Invalid request body.'))
	}

	const { type, value } = result.data

	try {
		await db
			.update(userPreferences)
			.set({ [type]: value })
			.where(eq(userPreferences.userId, userId))

		res.status(201).json({ message: 'User preferences updated successfully.' })
	} catch (error) {
		return next(
			new BadRequestError('Something went wrong, please try again later.'),
		)
	}
}
