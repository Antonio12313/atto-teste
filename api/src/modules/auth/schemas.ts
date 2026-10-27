import { z } from 'zod'
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  password: z.string().min(1).max(128),
})
export const userSchema = z.object({ id: z.uuid(), name: z.string(), email: z.email() })
export const userResponseSchema = z.object({ user: userSchema })
export type PublicUser = z.infer<typeof userSchema>

export const errorSchema = z.object({ statusCode: z.number(), error: z.string(), message: z.string() })
