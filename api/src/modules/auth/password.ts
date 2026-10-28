import { hash, verify } from '@node-rs/argon2'
export const hashPassword = (password: string) => hash(password, {
  algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1,
})
export const verifyPassword = (hash: string, password: string) => verify(hash, password)
