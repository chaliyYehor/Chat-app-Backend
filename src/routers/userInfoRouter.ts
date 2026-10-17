import express from 'express'
import { getUserInfoHandler } from '../controllers/getUserInfoHandler.js'
import { changeThemeHandler } from '../controllers/changeTheme.js'
import { getUserPreferences } from '../controllers/getUserPreferences.js'
import { changeUserPreferences } from '../controllers/changeUserPreferences.js'
import {
	editUserProfileSettings,
	upload,
} from '../controllers/editUserProfileSettings.js'

const router = express.Router()

router.get('/getUserInfo', getUserInfoHandler)
router.get('/getUserPreferences', getUserPreferences)

router.patch('/changeUserPreferences', changeUserPreferences)
router.patch('/changeTheme', changeThemeHandler)
router.patch(
	'/editUserProfileInfo',
	upload.single('file'),
	editUserProfileSettings,
)

export default router
