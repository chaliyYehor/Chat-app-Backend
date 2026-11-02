import { NextFunction, Request, Response } from 'express'
import z from 'zod'
import { BadRequestError } from '../../errors/badRequest.js'
import { db } from '../../db/db.js'
import { and, eq } from 'drizzle-orm'
import { groupUser, userProfile } from '../../db/schemas/schema.js'

export const getGroupMembers = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	const parsed = z
		.object({
			groupId: z.string().min(1, 'Group ID is required'),
		})
		.safeParse(req.query)

	if (!parsed.success) {
		return next(new BadRequestError(parsed.error.issues[0].message))
	}

	const { groupId } = parsed.data
	const userId = req.session.user.id

	try {
		const checkIfUserIsInGroup = await db.query.groupUser.findFirst({
			where: and(eq(groupUser.groupId, groupId), eq(groupUser.userId, userId)),
		})

		if (!checkIfUserIsInGroup) {
			return next(new BadRequestError('You are not a member of this group'))
		}

		const profiles = await db
			.select({
				userId: userProfile.userId,
				name: userProfile.name,
				imageUrl: userProfile.imageUrl,
				about: userProfile.about,
				theme: userProfile.theme,
				status: userProfile.status,
				previouslySetStatus: userProfile.previouslySetStatus,
				lastSeen: userProfile.lastSeen,
				role: groupUser.role,
			})
			.from(groupUser)
			.innerJoin(userProfile, eq(groupUser.userId, userProfile.userId))
			.where(eq(groupUser.groupId, groupId))

		profiles.sort((a, b) => {
			if (a.role === b.role) return 0
			return a.role === 'admin' ? -1 : 1
		})

		res.status(200).json(profiles)

		res.status(200).json(profiles)
	} catch (error) {
		return next(new BadRequestError('Failed to fetch group members'))
	}
}
