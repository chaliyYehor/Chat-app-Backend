import express from 'express'
import { searchPerson } from '../controllers/chatRelated/searchPerson.js'
import { getChats } from '../controllers/chatRelated/getChats.js'
import { getMessages } from '../controllers/chatRelated/getMessages.js'
import { convertToUrl } from '../controllers/chatRelated/convertToUrl.js'
import { deleteImage } from '../controllers/chatRelated/deleteImage.js'
import { upload } from '../controllers/userRelated/editUserProfileSettings.js'

const router = express.Router()

router.get('/searchPerson', searchPerson)
router.get('/getChats', getChats)
router.get('/getMessages', getMessages)
router.post('/convertToUrl', upload.single('image'), convertToUrl)
router.delete('/deleteImage', deleteImage)

export default router