import { eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import type { Database } from '../../db/client.js'
import { users, roles, rolePermissions, userRoles, userPermissions } from '../../db/schema.js'
import { isUniqueViolation, isForeignKeyViolation } from '../../db/errors.js'
import { PERMISSION_TREE, ALL_NODES } from '../../permissions/tree.js'
import { resolvePermission, isFullAdmin, type PermissionEffect, type ResolveContext } from '../../permissions/resolve.js'
import { loadResolveContext } from '../../permissions/load.js'
import { hashPassword } from '../auth/password.js'
import { roleCreateSchema, roleUpdateSchema, userCreateSchema, userUpdateSchema } from './schemas.js'

const BAD_REQUEST = { statusCode: 400, error: 'Bad Request', message: 'Dados inválidos.' }
const idParam = z.object({ id: z.uuid() })

async function buildContextFromProposal(db: Database, roleIds: string[], individual: Array<{ node: string; effect: PermissionEffect }>): Promise<ResolveContext> {
  const roleRows = roleIds.length ? await db.select().from(roles).where(inArray(roles.id, roleIds)) : []
  const permRows = roleIds.length ? await db.select().from(rolePermissions).where(inArray(rolePermissions.roleId, roleIds)) : []
  const nodesByRole = new Map<string, Set<string>>(roleRows.map(role => [role.id, new Set<string>()]))
  for (const row of permRows) nodesByRole.get(row.roleId)?.add(row.node)
  return {
    roles: roleRows.map(role => ({ name: role.name, nodes: nodesByRole.get(role.id) ?? new Set() })),
    individual: new Map(individual.map(rule => [rule.node, rule.effect])),
  }
}

async function activeFullAdminCount(db: Database, overrides: {
  roleNodes?: { roleId: string; nodes: string[] }
  user?: { userId: string; isActive?: boolean; roleIds?: string[]; individual?: Array<{ node: string; effect: PermissionEffect }> }
} = {}): Promise<number> {
  const [userRows, roleRows, permRows, allUserRoleLinks, allIndividualRows] = await Promise.all([
    db.select().from(users),
    db.select().from(roles),
    db.select().from(rolePermissions),
    db.select().from(userRoles),
    db.select().from(userPermissions),
  ])

  const nodesByRole = new Map<string, Set<string>>(roleRows.map(role => [role.id, new Set<string>()]))
  for (const row of permRows) nodesByRole.get(row.roleId)?.add(row.node)
  if (overrides.roleNodes) nodesByRole.set(overrides.roleNodes.roleId, new Set(overrides.roleNodes.nodes))
  const roleNameById = new Map(roleRows.map(role => [role.id, role.name]))

  const roleIdsByUser = new Map<string, string[]>()
  for (const link of allUserRoleLinks) roleIdsByUser.set(link.userId, [...(roleIdsByUser.get(link.userId) ?? []), link.roleId])
  const individualByUser = new Map<string, Array<{ node: string; effect: PermissionEffect }>>()
  for (const row of allIndividualRows) {
    individualByUser.set(row.userId, [...(individualByUser.get(row.userId) ?? []), { node: row.node, effect: row.effect as PermissionEffect }])
  }

  let count = 0
  for (const user of userRows) {
    const isOverridden = overrides.user?.userId === user.id
    const isActive = isOverridden && overrides.user!.isActive !== undefined ? overrides.user!.isActive : user.isActive
    if (!isActive) continue
    const roleIds = isOverridden && overrides.user!.roleIds !== undefined ? overrides.user!.roleIds! : (roleIdsByUser.get(user.id) ?? [])
    const individual = isOverridden && overrides.user!.individual !== undefined ? overrides.user!.individual! : (individualByUser.get(user.id) ?? [])
    const ctx: ResolveContext = {
      roles: roleIds.map(roleId => ({ name: roleNameById.get(roleId) ?? '', nodes: nodesByRole.get(roleId) ?? new Set() })),
      individual: new Map(individual.map(rule => [rule.node, rule.effect])),
    }
    if (isFullAdmin(ctx)) count++
  }
  return count
}

async function buildUserDetail(db: Database, userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId))
  if (!user) return null
  const roleLinks = await db.select({ id: roles.id, name: roles.name }).from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId)).where(eq(userRoles.userId, userId))
  const individualRows = await db.select().from(userPermissions).where(eq(userPermissions.userId, userId))
  const ctx = await loadResolveContext(db, userId)
  return {
    user: {
      id: user.id, attoLogin: user.attoLogin, name: user.name, isActive: user.isActive,
      isLocal: user.isLocal, isRoot: user.isRoot, lastLoginAt: user.lastLoginAt, createdAt: user.createdAt,
    },
    roleIds: roleLinks.map(role => role.id),
    individual: individualRows.map(row => ({ node: row.node, effect: row.effect as PermissionEffect })),
    effective: ALL_NODES.map(node => ({ node, ...resolvePermission(node, ctx) })),
  }
}

export async function adminRoutes(app: FastifyInstance, db: Database) {
  app.get('/admin/permissions/tree', { preHandler: app.authenticate }, async () => ({ tree: PERMISSION_TREE }))

  app.get('/admin/roles/options', { preHandler: [app.authenticate, app.requirePermission(['admin.usuarios', 'admin.perfis'])] }, async () => {
    const rows = await db.select({ id: roles.id, name: roles.name }).from(roles)
    return { roles: rows }
  })

  app.get('/admin/roles', { preHandler: [app.authenticate, app.requirePermission('admin.perfis')] }, async () => {
    const roleRows = await db.select().from(roles)
    const permRows = await db.select().from(rolePermissions)
    const nodesByRole = new Map<string, string[]>()
    for (const row of permRows) nodesByRole.set(row.roleId, [...(nodesByRole.get(row.roleId) ?? []), row.node])
    return {
      roles: roleRows.map(role => ({
        id: role.id, name: role.name, description: role.description,
        nodes: nodesByRole.get(role.id) ?? [], createdAt: role.createdAt, updatedAt: role.updatedAt,
      })),
    }
  })

  app.post('/admin/roles', { preHandler: [app.authenticate, app.requirePermission('admin.perfis')] }, async (request, reply) => {
    const parsed = roleCreateSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send(BAD_REQUEST)
    try {
      const [role] = await db.insert(roles).values({ name: parsed.data.name, description: parsed.data.description ?? null }).returning()
      if (parsed.data.nodes.length) await db.insert(rolePermissions).values(parsed.data.nodes.map(node => ({ roleId: role!.id, node })))
      return reply.code(201).send({ role: { id: role!.id, name: role!.name, description: role!.description, nodes: parsed.data.nodes } })
    } catch (error) {
      if (isUniqueViolation(error)) return reply.code(409).send({ statusCode: 409, error: 'Conflict', message: 'Já existe um perfil com esse nome.' })
      throw error
    }
  })

  app.patch('/admin/roles/:id', { preHandler: [app.authenticate, app.requirePermission('admin.perfis')] }, async (request, reply) => {
    const id = idParam.safeParse(request.params)
    if (!id.success) return reply.code(400).send(BAD_REQUEST)
    const parsed = roleUpdateSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send(BAD_REQUEST)
    const [existing] = await db.select().from(roles).where(eq(roles.id, id.data.id))
    if (!existing) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Perfil não encontrado.' })

    if (parsed.data.nodes !== undefined) {
      const remaining = await activeFullAdminCount(db, { roleNodes: { roleId: id.data.id, nodes: parsed.data.nodes } })
      if (remaining === 0) {
        return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Essa alteração deixaria o sistema sem nenhum administrador ativo.' })
      }
    }

    try {
      if (parsed.data.name !== undefined || parsed.data.description !== undefined) {
        await db.update(roles).set({
          ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
          ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
          updatedAt: new Date(),
        }).where(eq(roles.id, id.data.id))
      }
      if (parsed.data.nodes !== undefined) {
        await db.delete(rolePermissions).where(eq(rolePermissions.roleId, id.data.id))
        if (parsed.data.nodes.length) await db.insert(rolePermissions).values(parsed.data.nodes.map(node => ({ roleId: id.data.id, node })))
      }
    } catch (error) {
      if (isUniqueViolation(error)) return reply.code(409).send({ statusCode: 409, error: 'Conflict', message: 'Já existe um perfil com esse nome.' })
      throw error
    }

    const [updated] = await db.select().from(roles).where(eq(roles.id, id.data.id))
    const nodes = parsed.data.nodes
      ?? (await db.select({ node: rolePermissions.node }).from(rolePermissions).where(eq(rolePermissions.roleId, id.data.id))).map(row => row.node)
    return { role: { id: updated!.id, name: updated!.name, description: updated!.description, nodes } }
  })

  app.get('/admin/users', { preHandler: [app.authenticate, app.requirePermission('admin.usuarios')] }, async () => {
    const userRows = await db.select().from(users)
    const roleLinks = await db.select({ userId: userRoles.userId, name: roles.name }).from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
    const rolesByUser = new Map<string, string[]>()
    for (const row of roleLinks) rolesByUser.set(row.userId, [...(rolesByUser.get(row.userId) ?? []), row.name])
    return {
      users: userRows.map(user => ({
        id: user.id, attoLogin: user.attoLogin, name: user.name, isActive: user.isActive, isLocal: user.isLocal,
        roles: rolesByUser.get(user.id) ?? [], lastLoginAt: user.lastLoginAt,
      })),
    }
  })

  app.get('/admin/users/:id', { preHandler: [app.authenticate, app.requirePermission('admin.usuarios')] }, async (request, reply) => {
    const id = idParam.safeParse(request.params)
    if (!id.success) return reply.code(400).send(BAD_REQUEST)
    const detail = await buildUserDetail(db, id.data.id)
    if (!detail) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Usuário não encontrado.' })
    return detail
  })

  app.post('/admin/users', { preHandler: [app.authenticate, app.requirePermission('admin.usuarios')] }, async (request, reply) => {
    const parsed = userCreateSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send(BAD_REQUEST)
    const attoLoginNormalized = parsed.data.attoLogin.trim().toLowerCase()
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.attoLoginNormalized, attoLoginNormalized))
    if (existing) return reply.code(409).send({ statusCode: 409, error: 'Conflict', message: 'Já existe um usuário com esse login.' })

    try {
      const isLocal = !!parsed.data.password
      const [user] = await db.insert(users).values({
        attoLogin: parsed.data.attoLogin.trim(), attoLoginNormalized,
        name: parsed.data.name?.trim() || parsed.data.attoLogin.trim(),
        isLocal, passwordHash: isLocal ? await hashPassword(parsed.data.password!) : null,
      }).returning()
      if (parsed.data.roleIds.length) await db.insert(userRoles).values(parsed.data.roleIds.map(roleId => ({ userId: user!.id, roleId })))
      if (parsed.data.individual.length) {
        await db.insert(userPermissions).values(parsed.data.individual.map(rule => ({ userId: user!.id, node: rule.node, effect: rule.effect })))
      }
      return reply.code(201).send(await buildUserDetail(db, user!.id))
    } catch (error) {
      if (isForeignKeyViolation(error)) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Perfil inválido.' })
      throw error
    }
  })

  app.patch('/admin/users/:id', { preHandler: [app.authenticate, app.requirePermission('admin.usuarios')] }, async (request, reply) => {
    const id = idParam.safeParse(request.params)
    if (!id.success) return reply.code(400).send(BAD_REQUEST)
    const parsed = userUpdateSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send(BAD_REQUEST)
    const [existing] = await db.select().from(users).where(eq(users.id, id.data.id))
    if (!existing) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Usuário não encontrado.' })

    if (parsed.data.password !== undefined && !existing.isLocal) {
      return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Esta conta é da Atto; a senha vem de lá, não pode ser definida aqui.' })
    }

    const isSelf = id.data.id === request.user!.id
    const targetIsFullAdmin = isFullAdmin(await loadResolveContext(db, id.data.id))
    if (targetIsFullAdmin && (parsed.data.isActive === false || parsed.data.roleIds !== undefined || parsed.data.individual !== undefined)) {
      const remaining = await activeFullAdminCount(db, {
        user: { userId: id.data.id, isActive: parsed.data.isActive, roleIds: parsed.data.roleIds, individual: parsed.data.individual },
      })
      if (remaining === 0) {
        return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Deve existir sempre ao menos um administrador ativo no sistema.' })
      }
    }

    if (isSelf && parsed.data.isActive === false) {
      return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Você não pode desativar sua própria conta.' })
    }
    if (isSelf && (parsed.data.roleIds !== undefined || parsed.data.individual !== undefined)) {
      const currentRoleIds = (await db.select({ roleId: userRoles.roleId }).from(userRoles).where(eq(userRoles.userId, id.data.id))).map(row => row.roleId)
      const currentIndividual = (await db.select().from(userPermissions).where(eq(userPermissions.userId, id.data.id)))
        .map(row => ({ node: row.node, effect: row.effect as PermissionEffect }))
      const proposedCtx = await buildContextFromProposal(db, parsed.data.roleIds ?? currentRoleIds, parsed.data.individual ?? currentIndividual)
      if (!resolvePermission('admin.usuarios', proposedCtx).allowed) {
        return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Você não pode remover seu próprio acesso a Administração de usuários.' })
      }
    }

    try {
      if (parsed.data.name !== undefined || parsed.data.isActive !== undefined || parsed.data.password !== undefined) {
        await db.update(users).set({
          ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
          ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
          ...(parsed.data.password !== undefined ? { passwordHash: await hashPassword(parsed.data.password) } : {}),
          updatedAt: new Date(),
        }).where(eq(users.id, id.data.id))
      }
      if (parsed.data.roleIds !== undefined) {
        await db.delete(userRoles).where(eq(userRoles.userId, id.data.id))
        if (parsed.data.roleIds.length) await db.insert(userRoles).values(parsed.data.roleIds.map(roleId => ({ userId: id.data.id, roleId })))
      }
      if (parsed.data.individual !== undefined) {
        await db.delete(userPermissions).where(eq(userPermissions.userId, id.data.id))
        if (parsed.data.individual.length) {
          await db.insert(userPermissions).values(parsed.data.individual.map(rule => ({ userId: id.data.id, node: rule.node, effect: rule.effect })))
        }
      }
    } catch (error) {
      if (isForeignKeyViolation(error)) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Perfil inválido.' })
      throw error
    }

    return buildUserDetail(db, id.data.id)
  })
}
