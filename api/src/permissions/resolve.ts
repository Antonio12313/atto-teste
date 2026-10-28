import { ALL_NODES, getAncestorChain } from './tree.js'

export type PermissionEffect = 'allow' | 'deny'

export interface ResolveContext {
  /** Node sets granted by each role the user has. */
  roles: Array<{ name: string; nodes: ReadonlySet<string> }>
  /** Individual per-node overrides for the user. */
  individual: ReadonlyMap<string, PermissionEffect>
}

export interface ResolveResult {
  allowed: boolean
  source: 'individual' | 'role' | 'none'
  fromNode: string
  roleNames?: string[]
}

/**
 * Pure function: resolves whether `node` is allowed for a user, walking from
 * the node up to the root (most specific first). At each level: an
 * individual rule decides outright; otherwise a role granting that level
 * decides allow; otherwise keep going up. No match at any level → blocked.
 */
export function resolvePermission(node: string, ctx: ResolveContext): ResolveResult {
  for (const current of getAncestorChain(node)) {
    const individual = ctx.individual.get(current)
    if (individual) return { allowed: individual === 'allow', source: 'individual', fromNode: current }

    const roleNames = ctx.roles.filter(role => role.nodes.has(current)).map(role => role.name)
    if (roleNames.length > 0) return { allowed: true, source: 'role', fromNode: current, roleNames }
  }
  return { allowed: false, source: 'none', fromNode: node }
}

/** All nodes in the tree the user currently has access to. */
export function resolveAllPermissions(ctx: ResolveContext): string[] {
  return ALL_NODES.filter(node => resolvePermission(node, ctx).allowed)
}

/** True if any of the given nodes resolves to allowed. */
export function resolveAny(nodes: string[], ctx: ResolveContext): boolean {
  return nodes.some(node => resolvePermission(node, ctx).allowed)
}

/** True if the user has every permission node — a full administrator. */
export function isFullAdmin(ctx: ResolveContext): boolean {
  return resolveAllPermissions(ctx).length === ALL_NODES.length
}
