import { z } from 'zod'

const rangeFields = {
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD.'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD.'),
  campaignId: z.string().trim().min(1).optional(),
}
function fromBeforeTo(q: { from: string; to: string }) {
  return q.from <= q.to
}
function within90Days(q: { from: string; to: string }) {
  return (new Date(`${q.to}T00:00:00Z`).getTime() - new Date(`${q.from}T00:00:00Z`).getTime()) / 86_400_000 <= 90
}

export const rangeQuerySchema = z.object(rangeFields)
  .refine(fromBeforeTo, { message: '"from" deve ser anterior ou igual a "to".' })
  .refine(within90Days, { message: 'Intervalo máximo de 90 dias.' })

export const pagedRangeQuerySchema = z.object({
  ...rangeFields,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().min(1).max(100).optional(),
})
  .refine(fromBeforeTo, { message: '"from" deve ser anterior ou igual a "to".' })
  .refine(within90Days, { message: 'Intervalo máximo de 90 dias.' })
