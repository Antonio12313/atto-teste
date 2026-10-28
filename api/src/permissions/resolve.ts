import { ALL_NODES, getAncestorChain } from './tree.js'

export type PermissionEffect = 'allow' | 'deny'

export interface ResolveContext {
  roles: Array<{ name: string; nodes: ReadonlySet<string> }>
  individual: ReadonlyMap<string, PermissionEffect>
}

export interface ResolveResult {
  allowed: boolean
  source: 'individual' | 'role' | 'none'
  fromNode: string
  roleNames?: string[]
}

export function resolvePermission(node: string, ctx: ResolveContext): ResolveResult {
  for (const current of getAncestorChain(node)) {
    const individual = ctx.individual.get(current)
    if (individual) return { allowed: individual === 'allow', source: 'individual', fromNode: current }

    const roleNames = ctx.roles.filter(role => role.nodes.has(current)).map(role => role.name)
    if (roleNames.length > 0) return { allowed: true, source: 'role', fromNode: current, roleNames }
  }
  return { allowed: false, source: 'none', fromNode: node }
}

export function resolveAllPermissions(ctx: ResolveContext): string[] {
  return ALL_NODES.filter(node => resolvePermission(node, ctx).allowed)
}

export function resolveAny(nodes: string[], ctx: ResolveContext): boolean {
  return nodes.some(node => resolvePermission(node, ctx).allowed)
}

export function isFullAdmin(ctx: ResolveContext): boolean {
  return resolveAllPermissions(ctx).length === ALL_NODES.length
}
