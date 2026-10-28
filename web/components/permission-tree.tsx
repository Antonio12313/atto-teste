"use client"
import { useState, type ReactNode } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"

export interface PermissionNode {
  id: string
  label: string
  children?: PermissionNode[]
}

export function flattenTree(tree: PermissionNode[]): PermissionNode[] {
  return tree.flatMap((node) => [node, ...flattenTree(node.children ?? [])])
}

export function buildParentMap(tree: PermissionNode[]): Map<string, string | null> {
  const map = new Map<string, string | null>()
  const walk = (nodes: PermissionNode[], parent: string | null) => {
    for (const node of nodes) {
      map.set(node.id, parent)
      if (node.children) walk(node.children, node.id)
    }
  }
  walk(tree, null)
  return map
}

/** From `id` up to the root, including `id` itself. */
export function getAncestors(id: string, parentMap: Map<string, string | null>): string[] {
  const chain: string[] = []
  let current: string | null | undefined = id
  while (current) {
    chain.push(current)
    current = parentMap.get(current)
  }
  return chain
}

export function PermissionTreeView({
  tree,
  renderControl,
  renderExtra,
}: {
  tree: PermissionNode[]
  renderControl: (node: PermissionNode) => ReactNode
  renderExtra?: (node: PermissionNode) => ReactNode
}) {
  return (
    <ul className="space-y-1">
      {tree.map((node) => (
        <TreeItem
          key={node.id}
          node={node}
          depth={0}
          renderControl={renderControl}
          renderExtra={renderExtra}
        />
      ))}
    </ul>
  )
}

function TreeItem({
  node,
  depth,
  renderControl,
  renderExtra,
}: {
  node: PermissionNode
  depth: number
  renderControl: (node: PermissionNode) => ReactNode
  renderExtra?: (node: PermissionNode) => ReactNode
}) {
  const [open, setOpen] = useState(true)
  const hasChildren = !!node.children?.length
  return (
    <li>
      <div
        className="flex flex-wrap items-center gap-2 rounded-md py-1.5 pr-2 hover:bg-muted/50"
        style={{ paddingLeft: depth * 24 }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-label={open ? "Recolher" : "Expandir"}
            className="shrink-0 text-muted-foreground"
          >
            {open ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
          </button>
        ) : (
          <span className="inline-block size-4 shrink-0" />
        )}
        {renderControl(node)}
        <span className="text-sm">{node.label}</span>
        {renderExtra && <span className="ml-auto flex items-center gap-2">{renderExtra(node)}</span>}
      </div>
      {hasChildren && open && (
        <ul>
          {node.children!.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              renderControl={renderControl}
              renderExtra={renderExtra}
            />
          ))}
        </ul>
      )}
    </li>
  )
}
