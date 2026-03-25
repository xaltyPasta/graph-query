export interface GraphNode {
  id: string; // e.g. "Order_123"
  label: string; // e.g. "Order #123"
  type: string; // e.g. "Order"
  metadata: Record<string, any>;
  degree?: number;
  highlight?: boolean;
}

export interface GraphEdge {
  source: string; // e.g. "Customer_abc"
  target: string; // e.g. "Order_123"
  label: string;
  highlight?: boolean;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface QueryResponse {
  answer: string;
  highlightNodes: string[];
  highlightEdges: Array<{ source: string; target: string }>;
  rawRows?: unknown[];
  queryType?: string;
  error?: string;
}

export async function fetchGraphData(): Promise<GraphData> {
  const url = new URL("http://localhost:5000/api/graph");

  const response = await fetch(url.toString(), {
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch graph data: ${response.statusText}`);
  }

  // The backend was updated to return { graph: GraphData } or just GraphData
  // depending on graph.controller.ts logic. 
  // Wait, graph.controller.ts returns { graph, meta }
  const data = await response.json();
  return data.graph || data;
}

export async function executeQuery(question: string): Promise<QueryResponse> {
  const url = new URL("http://localhost:5000/api/query");
  
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: question }), // changed to query matching backend Expectation if req.body.query is expected
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => null);
    throw new Error(errData?.error || `Failed to execute query: ${response.statusText}`);
  }

  const result = await response.json();
  
  // Unwrap the robust backend format
  return {
    answer: result.answer || "No text available.",
    highlightNodes: result.graphContext?.highlightNodes || [],
    highlightEdges: result.graphContext?.highlightEdges || [],
    rawRows: result.rawData || [],
    queryType: result.meta?.status,
    error: result.error
  };
}
