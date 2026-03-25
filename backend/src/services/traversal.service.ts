import { GraphEdge, GraphNode } from "./graph.service";

export interface TraversalResult {
  path: string[];
  highlightNodes: string[];
  highlightEdges: Array<{ source: string; target: string }>;
}

export function bfsTraversal(
  startNodeId: string,
  edges: GraphEdge[],
  nodes: GraphNode[],
  maxDepth = 6
): TraversalResult {
  const nodeSet = new Set(nodes.map((n) => n.id));
  if (!nodeSet.has(startNodeId)) {
    return { path: [], highlightNodes: [], highlightEdges: [] };
  }

  const adj: Record<string, string[]> = {};
  for (const edge of edges) {
    if (!adj[edge.source]) adj[edge.source] = [];
    adj[edge.source].push(edge.target);
  }

  const visited = new Set<string>();
  const queue: Array<{ id: string; depth: number }> = [{ id: startNodeId, depth: 0 }];
  const path: string[] = [];
  const usedEdges: Array<{ source: string; target: string }> = [];

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (visited.has(id) || depth > maxDepth) continue;
    visited.add(id);
    path.push(id);

    for (const neighbor of adj[id] ?? []) {
      if (!visited.has(neighbor)) {
        usedEdges.push({ source: id, target: neighbor });
        queue.push({ id: neighbor, depth: depth + 1 });
      }
    }
  }

  return { path, highlightNodes: path, highlightEdges: usedEdges };
}

export function resolveStartNode(keyword: string, nodes: GraphNode[]): string | null {
  const direct = nodes.find((n) => n.id === keyword);
  if (direct) return direct.id;
  const partial = nodes.find((n) => n.id.toLowerCase().includes(keyword.toLowerCase()));
  if (partial) return partial.id;
  return null;
}
