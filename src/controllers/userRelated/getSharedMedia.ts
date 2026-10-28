import { NextFunction, Request, Response } from 'express'
import z from 'zod'
import { BadRequestError } from '../../errors/badRequest.js'
import { db } from '../../db/db.js'
import { and, desc, eq, isNotNull, or } from 'drizzle-orm'
import { conversation, message } from '../../db/schemas/schema.js'

export const getSharedMedia = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	const parsed = z
		.object({ chatId: z.string().min(1), otherUserId: z.string().min(1) })
		.safeParse(req.query)

	if (!parsed.success) {
		return next(new BadRequestError('Invalid query parameters'))
	}

	const { chatId, otherUserId } = parsed.data
	const userId = req.session.user.id

	try {
		const checkIfValidConversation = await db.query.conversation.findFirst({
			where: and(
				eq(conversation.id, chatId),
				and(
					or(
						eq(conversation.userOneId, userId),
						eq(conversation.userTwoId, userId),
					),
					or(
						eq(conversation.userOneId, otherUserId),
						eq(conversation.userTwoId, otherUserId),
					),
				),
			),
		})

		if (!checkIfValidConversation) {
			return next(new BadRequestError('Invalid conversation or user'))
		}

		const sharedMedia = await db.query.message.findMany({
			where: and(
				eq(message.conversationId, chatId),
				isNotNull(message.imageUrl),
			),
			columns: {
				id: true,
				imageUrl: true,
			},
			orderBy: desc(message.createdAt),
		})

		return res.status(200).json(sharedMedia)
	} catch (error) {
		return next(error)
	}
}
