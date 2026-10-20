import express from 'express'
import { searchPerson } from '../controllers/chatRelated/searchPerson.js'
import { getChats } from '../controllers/chatRelated/getChats.js'

const router = express.Router()

router.get('/searchPerson', searchPerson)
router.get('/getChats', getChats)

export default router