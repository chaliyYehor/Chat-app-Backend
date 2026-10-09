import express from 'express'
import { getUserInfoHandler } from '../controllers/getUserInfoHandler.js'
import { changeThemeHandler } from '../controllers/changeTheme.js'

const router = express.Router()

router.get('/getUserInfo', getUserInfoHandler)

router.patch('/changeTheme', changeThemeHandler)
export default router
