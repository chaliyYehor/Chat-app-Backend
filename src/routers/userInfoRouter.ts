import express from 'express'
import { changeUserPreferences } from '../controllers/userRelated/changeUserPreferences.js'
import { getUserInfoHandler } from '../controllers/userRelated/getUserInfoHandler.js'
import { getUserPreferences } from '../controllers/userRelated/getUserPreferences.js'
import { changeThemeHandler } from '../controllers/userRelated/changeTheme.js'
import { editUserProfileSettings, upload } from '../controllers/userRelated/editUserProfileSettings.js'

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
