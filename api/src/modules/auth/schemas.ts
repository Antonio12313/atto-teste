import { z } from 'zod'
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  password: z.string().min(1).max(128),
})
export type PublicUser = { id: string; name: string; email: string }
