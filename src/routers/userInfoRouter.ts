import express from 'express'
import { changeUserPreferences } from '../controllers/userRelated/changeUserPreferences.js'
import { getUserInfoHandler } from '../controllers/userRelated/getUserInfoHandler.js'
import { getUserPreferences } from '../controllers/userRelated/getUserPreferences.js'
import { changeThemeHandler } from '../controllers/userRelated/changeTheme.js'
import { editUserProfileSettings, upload } from '../controllers/userRelated/editUserProfileSettings.js'
import { getUserInfoChat } from '../controllers/userRelated/getUserInfoChat.js'
import { getChatInfo } from '../controllers/userRelated/getChatInfo.js'

const router = express.Router()

router.get('/getUserInfo', getUserInfoHandler)
router.get('/getUserPreferences', getUserPreferences)
router.get('/getUserInfoChat', getUserInfoChat)
router.get('/getChatInfo', getChatInfo)

router.patch('/changeUserPreferences', changeUserPreferences)
router.patch('/changeTheme', changeThemeHandler)
router.patch(
	'/editUserProfileInfo',
	upload.single('file'),
	editUserProfileSettings,
)

export default router
