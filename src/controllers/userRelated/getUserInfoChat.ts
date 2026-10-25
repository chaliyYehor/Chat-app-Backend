import { and, eq, or } from 'drizzle-orm'
import { conversation, user, userProfile } from '../../db/schemas/schema.js'
import { NextFunction, Request, Response } from 'express'
import z from 'zod'
import { BadRequestError } from '../../errors/badRequest.js'
import { db } from '../../db/db.js'

export const getUserInfoChat = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	console.log(req.query)
	const parsed = z
		.object({
			conversationId: z.uuid(),
		})
		.safeParse(req.query)

	if (!parsed.success) {
		return next(new BadRequestError('Invalid credentials'))
	}

	const conversationId = parsed.data.conversationId

	try {
		const conversationData = await db.query.conversation.findFirst({
			where: eq(conversation.id, conversationId),
			columns: {
				userOneId: true,
				userTwoId: true,
			},
		})

		if (!conversationData) {
			return next(new BadRequestError('Conversation not found'))
		}

		const otherUserId =
			conversationData.userOneId === req.session.user.id
				? conversationData.userTwoId
				: conversationData.userOneId

		const userInfo = await db.query.userProfile.findFirst({
			where: eq(userProfile.userId, otherUserId),
			columns: {
				imagePubId: false,
				theme: false,
			},
		})

		if (!userInfo) {
			return next(new BadRequestError('User profile not found'))
		}

		const userAccount = await db.query.user.findFirst({
			where: eq(user.id, otherUserId),
			columns: {
				email: true,
			},
		})

		if (!userAccount) {
			return next(new BadRequestError('User account not found'))
		}

		return res.status(200).json({
			...userInfo,
			email: userAccount.email,
		})
	} catch (error) {
		return next(error)
	}
}
