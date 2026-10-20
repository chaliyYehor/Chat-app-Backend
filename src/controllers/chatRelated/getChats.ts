import { NextFunction, Request, Response } from 'express'
import { BadRequestError } from '../../errors/badRequest.js'
import { db } from '../../db/db.js'
import { and, desc, eq, or } from 'drizzle-orm'
import {
	conversation,
	conversationUser,
	userProfile,
} from '../../db/schemas/schema.js'
import { StatusCodes } from 'http-status-codes'
import { alias } from 'drizzle-orm/pg-core'

export const getChats = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	const userId = req.session.user.id

	try {
		const userOneProfile = alias(userProfile, 'user_one_profile')
		const userTwoProfile = alias(userProfile, 'user_two_profile')
		const chats = await db
			.select({
				conversation,
				conversationUser,

				userOne: {
					userId: userOneProfile.userId,
					name: userOneProfile.name,
					imageUrl: userOneProfile.imageUrl,
					status: userOneProfile.status,
					previouslySetStatus: userOneProfile.previouslySetStatus,
					lastSeen: userOneProfile.lastSeen,
				},

				userTwo: {
					userId: userTwoProfile.userId,
					name: userTwoProfile.name,
					imageUrl: userTwoProfile.imageUrl,
					status: userTwoProfile.status,
					previouslySetStatus: userTwoProfile.previouslySetStatus,
					lastSeen: userTwoProfile.lastSeen,
				},
			})
			.from(conversation)
			.innerJoin(
				conversationUser,
				and(
					eq(conversationUser.conversationId, conversation.id),
					eq(conversationUser.userId, userId),
				),
			)
			.leftJoin(
				userOneProfile,
				eq(userOneProfile.userId, conversation.userOneId),
			)
			.leftJoin(
				userTwoProfile,
				eq(userTwoProfile.userId, conversation.userTwoId),
			)
			.where(
				or(
					eq(conversation.userOneId, userId),
					eq(conversation.userTwoId, userId),
				),
			)
			.orderBy(desc(conversation.updatedAt))

		res.status(StatusCodes.OK).json(chats)
	} catch (error) {
		return next(new BadRequestError('Failed to get chats'))
	}
}
