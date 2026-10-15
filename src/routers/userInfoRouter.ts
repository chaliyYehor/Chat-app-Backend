import express from 'express'
import { getUserInfoHandler } from '../controllers/getUserInfoHandler.js'
import { changeThemeHandler } from '../controllers/changeTheme.js'
import { getUserPreferences } from '../controllers/getUserPreferences.js'
import { changeUserPreferences } from '../controllers/changeUserPreferences.js'

const router = express.Router()

router.get('/getUserInfo', getUserInfoHandler)
router.get('/getUserPreferences', getUserPreferences)

router.patch('/changeUserPreferences', changeUserPreferences)
router.patch('/changeTheme', changeThemeHandler)
export default router

