import { z } from 'zod'
export const loginSchema = z.object({
  username: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(128),
})
export type PublicUser = { id: string; name: string; atto_login: string }
