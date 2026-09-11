import type { NextFunction, Request, Response } from 'express'
import { CustomError } from '../errors/customError.js'
import { StatusCodes } from 'http-status-codes'

export const errorMiddleware = (
	err: Error,
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	if (res.headersSent) {
		return next(err)
	}

	if (err instanceof CustomError) {
		return res.status(err.statusCode).json({ msg: err.message })
	}

	console.error(err)

	return res
		.status(StatusCodes.INTERNAL_SERVER_ERROR)
		.json({ msg: err.message || 'Something went wrong, try again later' })
}
