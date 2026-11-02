import { NextFunction, Request, Response } from 'express'
import z from 'zod'
import { BadRequestError } from '../../errors/badRequest.js'
import { db } from '../../db/db.js'
import { and, desc, eq } from 'drizzle-orm'
import {
	groupUser,
	message,
	user,
	userPreferences,
	userProfile,
} from '../../db/schemas/schema.js'

export const getGroupMessages = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	const parsed = z
		.object({
			query: z.object({
				groupId: z.string().min(1, 'Group ID is required'),
				page: z.coerce.number().int().min(1).default(1),
				limit: z.coerce.number().int().min(1).max(100).default(20),
			}),
		})
		.safeParse(req)

	if (!parsed.success) {
		return next(new BadRequestError('Invalid request parameters'))
	}

	const userId = req.session.user.id
	const { groupId, page, limit } = parsed.data.query

	try {
		const checkIfUserIsInGroup = await db.query.groupUser.findFirst({
			where: and(eq(groupUser.groupId, groupId), eq(groupUser.userId, userId)),
		})

		if (!checkIfUserIsInGroup) {
			return next(new BadRequestError('User is not part of this group'))
		}

		const messages = await db
			.select({
				id: message.id,
				conversationId: message.conversationId,
				groupId: message.groupId,
				senderId: message.senderId,
				createdAt: message.createdAt,
				read: message.read,
				type: message.type,
				text: message.text,
				imageUrl: message.imageUrl,
				imagePubId: message.imagePubId,
				senderInfo: {
					userId: userProfile.userId,
					email: user.email,
					name: userProfile.name,
					imageUrl: userProfile.imageUrl,
					createdAt: userProfile.createdAt,
					updatedAt: userProfile.updatedAt,
					status: userProfile.status,
					about: userProfile.about,
					userPubId: userProfile.userPubId,
					previouslySetStatus: userProfile.previouslySetStatus,
					lastSeen: userProfile.lastSeen,
					lastSeenVisible: userPreferences.lastSeen,
				},
			})
			.from(message)
			.innerJoin(userProfile, eq(message.senderId, userProfile.userId))
			.innerJoin(user, eq(message.senderId, user.id))
			.leftJoin(userPreferences, eq(message.senderId, userPreferences.userId))
			.where(eq(message.groupId, groupId))
			.orderBy(desc(message.createdAt))
			.limit(limit + 1)
			.offset((page - 1) * limit)

		const hasMore = messages.length > limit
		const paginatedMessages = messages.slice(0, limit).map(({ senderInfo, ...msg }) => {
			const { lastSeenVisible, ...profile } = senderInfo
			return {
				...msg,
				senderInfo: {
					...profile,
					lastSeen: lastSeenVisible ? profile.lastSeen : undefined,
				},
			}
		})

		res.status(200).json({
			messages: paginatedMessages,
			hasMore,
		})
	} catch (error) {
		return next(new BadRequestError('Failed to retrieve group messages'))
	}
}
