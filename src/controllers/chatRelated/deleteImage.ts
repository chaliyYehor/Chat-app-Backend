import { Request, Response, NextFunction } from 'express'
import z from 'zod'
import cloudinary from '../../lib/cloudinary.js'
import { BadRequestError } from '../../errors/badRequest.js'

const deleteImageSchema = z.object({
	publicId: z.string().trim().min(1),
})

export const deleteImage = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	const parsed = deleteImageSchema.safeParse(req.body)

	if (!parsed.success) {
		return next(new BadRequestError('Invalid image public ID'))
	}

	const ownerPrefix = `message-pictures/${req.session.user.id}/`

	if (!parsed.data.publicId.startsWith(ownerPrefix)) {
		return next(new BadRequestError('You cannot delete this image'))
	}

	try {
		const result = await cloudinary.uploader.destroy(parsed.data.publicId)

		if (result.result !== 'ok' && result.result !== 'not found') {
			return next(new BadRequestError('Failed to delete image'))
		}

		return res.status(200).json({ success: true })
	} catch (error) {
		return next(error)
	}
}
