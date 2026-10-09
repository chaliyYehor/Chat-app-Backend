import { NextFunction, Request, Response } from 'express'
import { auth } from '../lib/auth.js'
import { fromNodeHeaders } from 'better-auth/node'
import { UnauthenticatedError } from '../errors/unauthenticated.js'

export const authenticationMiddleware = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	const session = await auth.api.getSession({
		headers: fromNodeHeaders(req.headers)
	})

	if(!session) {
		return next(new UnauthenticatedError('Unauthenticated'))
	}

	req.session = session

	next()
}