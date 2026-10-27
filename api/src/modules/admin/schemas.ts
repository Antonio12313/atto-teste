import { z } from 'zod'
import { isValidNode } from '../../permissions/tree.js'

const nodeSchema = z.string().refine(isValidNode, 'Nó de permissão inválido.')
const effectSchema = z.enum(['allow', 'deny'])
export const individualRuleSchema = z.object({ node: nodeSchema, effect: effectSchema })

export const roleCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional().nullable(),
  nodes: z.array(nodeSchema).default([]),
})
export const roleUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  nodes: z.array(nodeSchema).optional(),
})

export const userCreateSchema = z.object({
  attoLogin: z.string().trim().min(1).max(254),
  name: z.string().trim().min(1).max(200).optional(),
  roleIds: z.array(z.uuid()).default([]),
  individual: z.array(individualRuleSchema).default([]),
})
export const userUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  isActive: z.boolean().optional(),
  roleIds: z.array(z.uuid()).optional(),
  individual: z.array(individualRuleSchema).optional(),
})
