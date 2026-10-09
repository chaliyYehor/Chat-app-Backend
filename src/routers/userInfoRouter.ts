import express, { NextFunction, Request, Response } from 'express'
import { getUserInfoHandler } from '../controllers/getUserInfoHandler.js'
import { authenticationMiddleware } from '../middleware/authenticationMiddleware.js'

const router = express.Router()

router.get(
	'/getUserInfo',
	authenticationMiddleware,
	getUserInfoHandler
)

export default router
