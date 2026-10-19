import express from 'express'
import { searchPerson } from '../controllers/chatRelated/searchPerson.js'

const router = express.Router()

router.get('/searchPerson', searchPerson)

export default router