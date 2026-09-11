import { StatusCodes } from 'http-status-codes'
import { CustomError } from './customError.js'

export class BadRequestError extends CustomError {
	constructor(message: string) {
		super(message, StatusCodes.BAD_REQUEST)
	}
}
