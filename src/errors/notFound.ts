import { StatusCodes } from 'http-status-codes'
import { CustomError } from './customError.js'

export class NotFoundError extends CustomError {
	constructor(message: string) {
		super(message, StatusCodes.NOT_FOUND)
	}
}