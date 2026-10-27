function hasPgCode(error: unknown, code: string): boolean {
  return !!error && typeof error === 'object' && 'code' in error && (error as { code: unknown }).code === code
}
export const isUniqueViolation = (error: unknown) => hasPgCode(error, '23505')
export const isForeignKeyViolation = (error: unknown) => hasPgCode(error, '23503')
