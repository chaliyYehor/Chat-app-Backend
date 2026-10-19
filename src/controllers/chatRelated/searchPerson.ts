import { and, ilike, ne } from 'drizzle-orm'
import { NextFunction, Request, Response } from 'express'
import { BadRequestError } from '../../errors/badRequest.js'
import { db } from '../../db/db.js'
import { userProfile } from '../../db/schemas/schema.js'

export const searchPerson = async (req: Request, res: Response, next: NextFunction) => {
	const { search } = req.query

	if (typeof search !== 'string') {
		return next(new BadRequestError('Search query is required.'))
	}

	const query = search.trim()

	if (!query) {
		return res.status(200).json([])
	}

	const escapedQuery = query.replace(/[\\%_]/g, '\\$&')

	try {
		const people = await db
			.select({
				userId: userProfile.userId,
				name: userProfile.name,
				imageUrl: userProfile.imageUrl,
				status: userProfile.status,
			})
			.from(userProfile)
			.where(
				and(
					ilike(userProfile.name, `%${escapedQuery}%`),
					ne(userProfile.userId, req.session.user.id),
				),
			)
			.limit(20)

		return res.status(200).json(people)
	} catch (error) {
		return next(error)
	}
}