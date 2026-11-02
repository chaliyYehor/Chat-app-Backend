import z from 'zod'

const messageFields = {
	groupId: z.string().trim().min(1, 'Group ID is required'),
	imageUrl: z.string().url('Invalid image URL').nullable().optional(),
	imagePubId: z.string().trim().min(1).nullable().optional(),
	lastMessageAt: z.coerce.date().optional(),
}

export const sendGroupMessageSchema = z.discriminatedUnion('type', [
	z.object({
		...messageFields,
		type: z.literal('image'),
		imageUrl: z.string().url('Image URL is required'),
		text: z.string().trim().max(1500).nullable().optional(),
	}),
	z.object({
		...messageFields,
		type: z.literal('text_or_image'),
		text: z.string().trim().min(1, 'Message text is required').max(1500),
	}),
])

export type SendGroupMessage = z.infer<typeof sendGroupMessageSchema>
