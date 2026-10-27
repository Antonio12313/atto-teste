import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
export function encryptToken(token: string, key: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'base64'), iv)
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), encrypted].map(b => b.toString('base64')).join(':')
}
export function decryptToken(value: string, key: string) {
  const parts = value.split(':').map(part => Buffer.from(part, 'base64'))
  const [iv, tag, ciphertext] = parts
  if (parts.length !== 3 || !iv || iv.length !== 12 || !tag || tag.length !== 16 || !ciphertext) throw new Error('Invalid encrypted token')
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'base64'), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}
