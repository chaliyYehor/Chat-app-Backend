import { NextFunction, Request, Response } from 'express'
import { BadRequestError } from '../../errors/badRequest.js'
import { db } from '../../db/db.js'
import { group, groupUser } from '../../db/schemas/schema.js'
import { eq } from 'drizzle-orm'

export const getGroups = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	const userId = req.session.user.id

	try {
		const groups = await db
			.select({
				group: group,
				groupUser: groupUser,
			})
			.from(groupUser)
			.innerJoin(group, eq(group.id, groupUser.groupId))
			.where(eq(groupUser.userId, userId))

		res.status(200).json({ groups })
	} catch (error) {
		return next(new BadRequestError('Failed to fetch groups'))
	}
}
