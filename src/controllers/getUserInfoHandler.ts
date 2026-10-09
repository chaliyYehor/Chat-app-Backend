import { eq } from 'drizzle-orm'
import { NextFunction, Request, Response } from 'express'
import { db } from '../db/db.js'
import { userProfile } from '../db/schemas/schema.js'

export const getUserInfoHandler = async (req: Request, res: Response, next: NextFunction) => {
	const userId = req.session.user.id

	try {
		const userInfo = await db.query.userProfile.findFirst({
			where: eq(userProfile.userId, userId),
		})

		return res.status(200).json(userInfo)
	} catch (error) {
		return next(error)
	}
}