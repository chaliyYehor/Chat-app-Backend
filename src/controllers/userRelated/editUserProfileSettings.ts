import { NextFunction, Request, Response } from 'express'
import multer from 'multer'
import { v2 as cloudinary } from 'cloudinary'
import fs from 'fs/promises'
import { eq } from 'drizzle-orm'
import { StatusCodes } from 'http-status-codes'
import { editUserProfileInfoSchema } from '../../schemas/editUserProfileInfo.js'
import { BadRequestError } from '../../errors/badRequest.js'
import { userProfile } from '../../db/schemas/schema.js'
import { db } from '../../db/db.js'

cloudinary.config({
	cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
	api_key: process.env.CLOUDINARY_API_KEY,
	api_secret: process.env.CLOUDINARY_API_SECRET,
})

export const upload = multer({ dest: 'uploads/' })

const MAX_FILE_SIZE = 5 * 1024 * 1024

export const editUserProfileSettings = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	const parsed = editUserProfileInfoSchema.safeParse(req.body)
	if (!parsed.success) {
		return next(new BadRequestError('Invalid user input'))
	}

	const { bio, email, name, status } = parsed.data
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
				folder: 'profile-pictures',
			})
			imageUrl = result.secure_url
			imagePublicId = result.public_id
		}

		const data = {
			name,
			about: bio,
			status,
			updatedAt: new Date(),
			...(req.file && {
				imageUrl,
				imagePubId: imagePublicId,
			}),
		}

		await db
			.update(userProfile)
			.set(data)
			.where(eq(userProfile.userId, req.session.user.id))

		res.status(StatusCodes.OK).json({ msg: 'success' })
	} catch (error) {

		next(error)
	} finally {
		if (req.file?.path) {
			await fs.unlink(req.file.path).catch(() => {})
		}
	}
}
