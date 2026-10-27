import { eq, inArray } from 'drizzle-orm'
import type { Database } from '../db/client.js'
import { userRoles, roles, rolePermissions, userPermissions } from '../db/schema.js'
import type { ResolveContext, PermissionEffect } from './resolve.js'

/** Loads a user's roles and individual overrides into a ResolveContext. */
export async function loadResolveContext(db: Database, userId: string): Promise<ResolveContext> {
  const assignedRoles = await db.select({ id: roles.id, name: roles.name }).from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId)).where(eq(userRoles.userId, userId))
  const roleIds = assignedRoles.map(role => role.id)
  const permissionRows = roleIds.length
    ? await db.select().from(rolePermissions).where(inArray(rolePermissions.roleId, roleIds))
    : []
  const nodesByRole = new Map<string, Set<string>>(assignedRoles.map(role => [role.id, new Set<string>()]))
  for (const row of permissionRows) nodesByRole.get(row.roleId)?.add(row.node)

  const individualRows = await db.select().from(userPermissions).where(eq(userPermissions.userId, userId))
  const individual = new Map<string, PermissionEffect>(individualRows.map(row => [row.node, row.effect as PermissionEffect]))

  return {
    roles: assignedRoles.map(role => ({ name: role.name, nodes: nodesByRole.get(role.id) ?? new Set() })),
    individual,
  }
}
