import { NextFunction, Request, Response } from 'express'
import cloudinary from '../../lib/cloudinary.js'
import { BadRequestError } from '../../errors/badRequest.js'
import fs from 'fs/promises'

const MAX_FILE_SIZE = 5 * 1024 * 1024

export const convertToUrl = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	try {
		let imageUrl = ''
		let imagePublicId = ''

		if (req.file) {
			if (req.file.size > MAX_FILE_SIZE) {
				return next(new BadRequestError('Max image size is 5MB'))
			}

			if (!req.file.mimetype.startsWith('image/')) {
				return next(new BadRequestError('Only images are allowed'))
			}
			const result = await cloudinary.uploader.upload(req.file.path, {
				folder: `message-pictures/${req.session.user.id}`,
			})

			imageUrl = result.secure_url
			imagePublicId = result.public_id
		}

		res.json({
			imageUrl,
			imagePublicId,
		})
	} catch (error) {
		next(new BadRequestError('Something went wrong.'))
	} finally {
		if (req.file?.path) {
			await fs.unlink(req.file.path).catch(() => {})
		}
	}
}
