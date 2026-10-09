import { auth } from '../lib/auth.ts'

declare global {
	namespace Express {
		interface Request {
			session: typeof auth.$Infer.Session
		}
	}
}

export {}