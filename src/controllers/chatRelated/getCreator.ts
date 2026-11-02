import { NextFunction, Request, Response } from 'express'
import { BadRequestError } from '../../errors/badRequest.js'
import { db } from '../../db/db.js'
import { user, userProfile } from '../../db/schemas/schema.js'
import { eq } from 'drizzle-orm'

export const getCreator = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	try {
		const creatorEmail = process.env.CREATOR_EMAIL
		if (!creatorEmail) {
			return next(new BadRequestError('Creator email is not configured'))
		}

		const creator = await db
			.select({
				email: user.email,
				userId: user.id,
				name: userProfile.name,
				imageUrl: userProfile.imageUrl,
				status: userProfile.status,
				previouslySetStatus: userProfile.previouslySetStatus,
			})
			.from(userProfile)
			.leftJoin(user, eq(userProfile.userId, user.id))
			.where(eq(user.email, creatorEmail))

		if (!creator || creator.length === 0) {
			return next(new BadRequestError('Creator not found'))
		}

		res.status(200).json(creator[0])
	} catch (error) {
		return next(new BadRequestError('Failed to get creator'))
	}
}
