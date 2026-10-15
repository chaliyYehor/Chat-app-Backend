import { NextFunction, Request, Response } from 'express'
import { BadRequestError } from '../errors/badRequest.js'
import { db } from '../db/db.js'
import { eq } from 'drizzle-orm'
import { userPreferences } from '../db/schemas/schema.js'
import { StatusCodes } from 'http-status-codes'
import z from 'zod'

export const getUserPreferences = async (req: Request, res: Response, next: NextFunction) => {
	const userId = req.session.user.id

	try {
		const result = await db.query.userPreferences.findFirst({
			where: eq(userPreferences.userId, userId)
		})

		res.status(StatusCodes.OK).json(result)
	} catch (error) {
		return next(new BadRequestError('Something went wrong, please try again later.'))
	}
}