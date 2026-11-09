import { NextFunction, Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import { inArray, eq, desc } from 'drizzle-orm'
import { db } from '../../db/db.js'
import { call, callParticipant, group } from '../../db/schemas/schema.js'

export const getPreviousCalls = async (req: Request, res: Response, next: NextFunction) => {
	const userId = req.session.user.id

	try {
		const rows = await db
			.select({
				call,
				currentUser: {
					userId: callParticipant.userId,
					name: callParticipant.name,
					imageUrl: callParticipant.imageUrl,
					role: callParticipant.role,
					status: callParticipant.status,
					joinedAt: callParticipant.joinedAt,
					leftAt: callParticipant.leftAt,
				},
				group: {
					id: group.id,
					name: group.groupName,
				},
			})
			.from(callParticipant)
			.innerJoin(call, eq(call.id, callParticipant.callId))
			.leftJoin(group, eq(group.id, call.groupId))
			.where(eq(callParticipant.userId, userId))
			.orderBy(desc(call.startedAt))

		if (rows.length === 0) {
			return res.status(StatusCodes.OK).json([])
		}

		const callIds = rows.map(row => row.call.id)
		const participants = await db
			.select({
				callId: callParticipant.callId,
				userId: callParticipant.userId,
				name: callParticipant.name,
				imageUrl: callParticipant.imageUrl,
				role: callParticipant.role,
				status: callParticipant.status,
				joinedAt: callParticipant.joinedAt,
				leftAt: callParticipant.leftAt,
			})
			.from(callParticipant)
			.where(inArray(callParticipant.callId, callIds))

		const participantsByCall = new Map<string, typeof participants>()
		for (const participant of participants) {
			const current = participantsByCall.get(participant.callId) ?? []
			current.push(participant)
			participantsByCall.set(participant.callId, current)
		}

		return res.status(StatusCodes.OK).json(
			rows.map(({ call: callData, currentUser, group: groupData }) => ({
				...callData,
				group: groupData?.id ? groupData : null,
				currentUser,
				participants: participantsByCall.get(callData.id) ?? [],
			})),
		)
	} catch (error) {
		return next(error)
	}
}
