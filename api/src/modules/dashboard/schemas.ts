import { z } from 'zod'

export const rangeQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD.'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD.'),
  campaignId: z.string().trim().min(1).optional(),
}).refine(q => q.from <= q.to, { message: '"from" deve ser anterior ou igual a "to".' })
  .refine(q => (new Date(`${q.to}T00:00:00Z`).getTime() - new Date(`${q.from}T00:00:00Z`).getTime()) / 86_400_000 <= 90, {
    message: 'Intervalo máximo de 90 dias.',
  })
