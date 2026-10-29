import { and, eq, or } from 'drizzle-orm'
import {
	conversation,
	conversationUser,
	userProfile,
} from '../../db/schemas/schema.js'
import { NextFunction, Request, Response } from 'express'
import z from 'zod'
import { BadRequestError } from '../../errors/badRequest.js'
import { db } from '../../db/db.js'

export const getChatInfo = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	const parsed = z
		.object({
			conversationId: z.uuid(),
		})
		.safeParse(req.query)

	if (!parsed.success) {
		return next(new BadRequestError('Invalid credentials'))
	}

	const conversationId = parsed.data.conversationId
	const userId = req.session.user.id

	try {
		const [chat] = await db
			.select({
				conversationData: conversation,
				conversationUserData: conversationUser,
			})
			.from(conversation)
			.innerJoin(
				conversationUser,
				and(
					eq(conversationUser.conversationId, conversation.id),
					eq(conversationUser.userId, userId),
				),
			)
			.where(eq(conversation.id, conversationId))
			.limit(1)

		if (!chat) {
			return next(
				new BadRequestError('Conversation not found or user is not a member'),
			)
		}

		return res.status(200).json(chat)
	} catch (error) {
		return next(error)
	}
}
