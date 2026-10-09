import { NextFunction, Request, Response } from 'express'
import { auth } from '../lib/auth.js'
import { fromNodeHeaders } from 'better-auth/node'

export const authenticationMiddleware = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	const session = await auth.api.getSession({
		headers: fromNodeHeaders(req.headers)
	})

	if(!session) {
		return res.status(401).json({
			message: 'Unauthorized'
		})
	}

	req.session = session

	next()
}