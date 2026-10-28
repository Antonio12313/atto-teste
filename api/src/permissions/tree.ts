export interface PermissionNode {
  id: string;
  label: string;
  children?: PermissionNode[];
}

export const PERMISSION_TREE: PermissionNode[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    children: [
      {
        id: "dashboard.atto",
        label: "Atto",
        children: [
          { id: "dashboard.atto.chamadas", label: "Chamadas" },
          { id: "dashboard.atto.agentes", label: "Agentes" },
          { id: "dashboard.atto.tempo", label: "Tempo logado e pausas" },
        ],
      },
    ],
  },
  {
    id: "admin",
    label: "Administração",
    children: [
      { id: "admin.usuarios", label: "Usuários" },
      { id: "admin.perfis", label: "Perfis" },
    ],
  },
];

function flatten(
  nodes: PermissionNode[],
  parent: string | null,
  out: Map<string, string | null>,
) {
  for (const node of nodes) {
    out.set(node.id, parent);
    if (node.children) flatten(node.children, node.id, out);
  }
}
const PARENT_BY_NODE = new Map<string, string | null>();
flatten(PERMISSION_TREE, null, PARENT_BY_NODE);

export const ALL_NODES: string[] = [...PARENT_BY_NODE.keys()];
export const NODE_LABELS: Record<string, string> = (() => {
  const labels: Record<string, string> = {};
  const walk = (nodes: PermissionNode[]) => {
    for (const node of nodes) {
      labels[node.id] = node.label;
      if (node.children) walk(node.children);
    }
  };
  walk(PERMISSION_TREE);
  return labels;
})();

export function isValidNode(node: string): boolean {
  return PARENT_BY_NODE.has(node);
}

export function getAncestorChain(node: string): string[] {
  const chain: string[] = [];
  let current: string | null | undefined = node;
  while (current) {
    chain.push(current);
    current = PARENT_BY_NODE.get(current);
  }
  return chain;
}
