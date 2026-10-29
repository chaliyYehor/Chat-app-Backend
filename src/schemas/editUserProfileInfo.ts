import z from 'zod'

export const editUserProfileInfoSchema = z
	.object({
		previouslySetStatus: z.enum(['online', 'away', 'offline']).optional(),
		userId: z.string().optional(),
		name: z
			.string()
			.min(1, 'name is required')
			.max(30, 'name must be at most 30 characters')
			.optional(),
		bio: z.string().max(160, 'Bio must be at most 160 characters').optional(),
		email: z.string().email('Invalid email address').optional(),
	})
	.refine(data => Object.values(data).some(value => value !== undefined), {
		message: 'At least one profile field is required',
	})

export type EditUserProfileInfo = z.infer<typeof editUserProfileInfoSchema>
