import express from 'express'
import { getPreviousCalls } from '../controllers/callRelated/getPreviousCalls.js'

const router = express.Router()

router.get('/previous', getPreviousCalls)

export default router
