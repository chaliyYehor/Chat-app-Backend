import { NextFunction, Request, Response } from 'express'
import z from 'zod'
import { BadRequestError } from '../../errors/badRequest.js'
import { db } from '../../db/db.js'
import { and, desc, eq, or } from 'drizzle-orm'
import { conversation, message } from '../../db/schemas/schema.js'
import { UnauthorizedError } from '../../errors/unauthorized.js'

export const getMessages = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	const parsed = z
		.object({
			query: z.object({
				conversationId: z.string().min(1, 'Conversation ID is required'),
				page: z.coerce.number().int().min(1).default(1),
				limit: z.coerce.number().int().min(1).max(100).default(20),
			}),
		})
		.safeParse(req)

	if (!parsed.success) {
		return next(new BadRequestError('Invalid request parameters'))
	}

	const userId = req.session.user.id
	const { conversationId, page, limit } = parsed.data.query

	try {
		const checkIfUserIsInConversation = await db.query.conversation.findFirst({
			where: and(
				eq(conversation.id, conversationId),
				or(
					eq(conversation.userOneId, userId),
					eq(conversation.userTwoId, userId),
				),
			),
		})

		if(!checkIfUserIsInConversation) {
			return next(new UnauthorizedError('User is not part of this conversation'))
		}

		const messagesWithExtra = await db.query.message.findMany({
			where: eq(message.conversationId, conversationId),
			orderBy: desc(message.createdAt),
			limit: limit + 1,
			offset: (page - 1) * limit,
		})

		const hasMore = messagesWithExtra.length > limit
		const messages = messagesWithExtra.slice(0, limit)

		res.json({
			messages,
			hasMore,
		})
	} catch (error) {
		return next(new BadRequestError('Failed to get messages'))
	}
}
