import { IGraphRepository, GraphRepository } from "../repositories/graph.repository";

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  metadata: Record<string, any>;
  highlight?: boolean;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  metadata?: Record<string, any>;
  highlight?: boolean;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface TraversalOptions {
  depth?: number;
  nodeTypes?: string[];
  edgeTypes?: string[];
  highlightNodeIds?: string[];
  highlightEdgeIds?: string[];
}

enum EdgeType {
  PLACED = "PLACED",
  CONTAINS = "CONTAINS",
  DELIVERED_IN = "DELIVERED_IN",
  INVOICED_BY = "INVOICED_BY",
  PAID_BY = "PAID_BY",
  LOCATED_AT = "LOCATED_AT",
  ORDERS = "ORDERS", // Product -> OrderItem (or inverse)
  DELIVERED_TO = "DELIVERED_TO",
}

enum NodeType {
  CUSTOMER = "CUSTOMER",
  ORDER = "ORDER",
  ORDER_ITEM = "ORDER_ITEM",
  DELIVERY = "DELIVERY",
  INVOICE = "INVOICE",
  PAYMENT = "PAYMENT",
  PRODUCT = "PRODUCT",
  LOCATION = "LOCATION",
}

export class GraphBuilderService {
  private repository: IGraphRepository;

  constructor(repository?: IGraphRepository) {
    this.repository = repository || new GraphRepository();
  }

  public async getGraph(
    rootType: string,
    rootId: string,
    options: TraversalOptions = {}
  ): Promise<GraphData & { meta?: { truncated: boolean } }> {
    const startTime = Date.now();
    try {
      const maxDepth = options.depth ?? 3;
      const highlightNodes = new Set(options.highlightNodeIds ?? []);
      const highlightEdges = new Set(options.highlightEdgeIds ?? []);
      
      const nodeFilters = options.nodeTypes && options.nodeTypes.length > 0 ? new Set(options.nodeTypes) : null;
      const edgeFilters = options.edgeTypes && options.edgeTypes.length > 0 ? new Set(options.edgeTypes) : null;

      const visitedNodes = new Map<string, GraphNode>();
      const visitedEdges = new Map<string, GraphEdge>();

      // Configurable limits
      const MAX_NODES = 100;
      const MAX_EDGES = 200;
      let truncated = false;

      // Ensure root ID is built
      // Note: If the root node does not exist in the DB, the queries for relationships will just return empty.
      // But we still seed the queue. It might result in 0 nodes total if the DB has no match.
      let currentQueue = new Set<string>();
      if (rootType && rootId) {
        currentQueue.add(this.makeId(rootType, rootId));
      }

      let currentDepth = 0;

      while (currentQueue.size > 0 && currentDepth <= maxDepth) {
        if (visitedNodes.size >= MAX_NODES || visitedEdges.size >= MAX_EDGES) {
          truncated = true;
          break;
        }

        const nextQueue = new Set<string>();
        const idsByType = this.groupQueueByType(currentQueue);

        await Promise.all([
          this.processCustomers(idsByType.get(NodeType.CUSTOMER) ?? [], visitedNodes, visitedEdges, nextQueue, nodeFilters, edgeFilters, highlightNodes, highlightEdges),
          this.processOrders(idsByType.get(NodeType.ORDER) ?? [], visitedNodes, visitedEdges, nextQueue, nodeFilters, edgeFilters, highlightNodes, highlightEdges),
          this.processOrderItems(idsByType.get(NodeType.ORDER_ITEM) ?? [], visitedNodes, visitedEdges, nextQueue, nodeFilters, edgeFilters, highlightNodes, highlightEdges),
          this.processDeliveries(idsByType.get(NodeType.DELIVERY) ?? [], visitedNodes, visitedEdges, nextQueue, nodeFilters, edgeFilters, highlightNodes, highlightEdges),
          this.processInvoices(idsByType.get(NodeType.INVOICE) ?? [], visitedNodes, visitedEdges, nextQueue, nodeFilters, edgeFilters, highlightNodes, highlightEdges),
          this.processPayments(idsByType.get(NodeType.PAYMENT) ?? [], visitedNodes, visitedEdges, nextQueue, nodeFilters, edgeFilters, highlightNodes, highlightEdges),
          this.processProducts(idsByType.get(NodeType.PRODUCT) ?? [], visitedNodes, visitedEdges, nextQueue, nodeFilters, edgeFilters, highlightNodes, highlightEdges),
          this.processLocations(idsByType.get(NodeType.LOCATION) ?? [], visitedNodes, visitedEdges, nextQueue, nodeFilters, edgeFilters, highlightNodes, highlightEdges),
        ]);

        currentQueue = nextQueue;
        currentDepth++;
      }

      const executionTimeMs = Date.now() - startTime;
      
      console.log(JSON.stringify({
        step: "graph_builder_service",
        status: "success",
        rootType,
        rootId,
        nodeCount: visitedNodes.size,
        edgeCount: visitedEdges.size,
        truncated,
        executionTimeMs
      }));

      // Controlled response array even if empty
      return {
        nodes: Array.from(visitedNodes.values()),
        edges: Array.from(visitedEdges.values()),
        meta: { truncated }
      };
    } catch (err) {
      console.error(JSON.stringify({
        step: "graph_builder_service",
        status: "error",
        rootType,
        rootId,
        errorMessage: (err as Error).message,
        timestamp: new Date().toISOString()
      }));
      // Standardize unexposed error
      throw new Error("Something went wrong while processing the request.");
    }
  }

  // ───────────────────────────────────────────────────────────
  // Helpers
  // ───────────────────────────────────────────────────────────

  private makeId(type: string, id: string): string {
    return `${type.toUpperCase()}:${id}`;
  }

  private groupQueueByType(queue: Set<string>): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const item of queue) {
      const [type, id] = item.split(":");
      if (!map.has(type)) {
        map.set(type, []);
      }
      map.get(type)!.push(id);
    }
    return map;
  }

  private addNode(
    visitedNodes: Map<string, GraphNode>,
    type: string,
    id: string,
    label: string,
    metadata: any,
    highlightSet: Set<string>,
    nodeFilters: Set<string> | null
  ): boolean {
    const fullId = this.makeId(type, id);
    if (visitedNodes.has(fullId)) return true;
    if (nodeFilters && !nodeFilters.has(type)) return false;

    visitedNodes.set(fullId, {
      id: fullId,
      type,
      label,
      metadata,
      highlight: highlightSet.has(fullId) ? true : undefined,
    });
    return true;
  }

  private addEdge(
    visitedEdges: Map<string, GraphEdge>,
    nextQueue: Set<string>,
    visitedNodes: Map<string, GraphNode>,
    sourceType: string,
    sourceId: string,
    targetType: string,
    targetId: string,
    relType: string,
    highlightSet: Set<string>,
    edgeFilters: Set<string> | null
  ) {
    if (edgeFilters && !edgeFilters.has(relType)) return;

    const sourceFull = this.makeId(sourceType, sourceId);
    const targetFull = this.makeId(targetType, targetId);
    
    // Sort so undirected-like visualization doesn't duplicate edges visually if we want,
    // but here we use directed edges so ID is strict
    const edgeId = `${sourceFull}-[${relType}]->${targetFull}`;

    if (!visitedEdges.has(edgeId)) {
      visitedEdges.set(edgeId, {
        id: edgeId,
        source: sourceFull,
        target: targetFull,
        type: relType,
        highlight: highlightSet.has(edgeId) ? true : undefined,
      });
    }

    // Queue the target if we haven't processed it
    if (!visitedNodes.has(targetFull)) {
      nextQueue.add(targetFull);
    }
  }

  // ───────────────────────────────────────────────────────────
  // Entity Processors
  // ───────────────────────────────────────────────────────────

  private async processCustomers(
    ids: string[], visitedNodes: Map<string, GraphNode>, visitedEdges: Map<string, GraphEdge>, nextQueue: Set<string>,
    nodeFilters: Set<string> | null, edgeFilters: Set<string> | null, highlightNodes: Set<string>, highlightEdges: Set<string>
  ) {
    if (ids.length === 0) return;
    const records = await this.repository.getCustomersByIds(ids);

    for (const rec of records) {
      const added = this.addNode(visitedNodes, NodeType.CUSTOMER, rec.id, rec.name, { email: rec.email, phone: rec.phone, createdAt: rec.createdAt }, highlightNodes, nodeFilters);
      if (!added) continue;

      if (rec.addressId) {
        this.addEdge(visitedEdges, nextQueue, visitedNodes, NodeType.CUSTOMER, rec.id, NodeType.LOCATION, rec.addressId, EdgeType.LOCATED_AT, highlightEdges, edgeFilters);
      }
      for (const order of rec.orders) {
        this.addEdge(visitedEdges, nextQueue, visitedNodes, NodeType.CUSTOMER, rec.id, NodeType.ORDER, order.id, EdgeType.PLACED, highlightEdges, edgeFilters);
      }
    }
  }

  private async processOrders(
    ids: string[], visitedNodes: Map<string, GraphNode>, visitedEdges: Map<string, GraphEdge>, nextQueue: Set<string>,
    nodeFilters: Set<string> | null, edgeFilters: Set<string> | null, highlightNodes: Set<string>, highlightEdges: Set<string>
  ) {
    if (ids.length === 0) return;
    const records = await this.repository.getOrdersByIds(ids);

    for (const rec of records) {
      const added = this.addNode(visitedNodes, NodeType.ORDER, rec.id, `Order ${rec.id}`, { status: rec.status, totalAmount: rec.totalAmount, createdAt: rec.createdAt }, highlightNodes, nodeFilters);
      if (!added) continue;

      if (rec.customerId) {
        this.addEdge(visitedEdges, nextQueue, visitedNodes, NodeType.CUSTOMER, rec.customerId, NodeType.ORDER, rec.id, EdgeType.PLACED, highlightEdges, edgeFilters);
      }
      for (const item of rec.orderItems) {
        this.addEdge(visitedEdges, nextQueue, visitedNodes, NodeType.ORDER, rec.id, NodeType.ORDER_ITEM, item.id, EdgeType.CONTAINS, highlightEdges, edgeFilters);
      }
      // Note: Relation Order -> Delivery via Deliveries array
      for (const del of rec.deliveries) {
        this.addEdge(visitedEdges, nextQueue, visitedNodes, NodeType.ORDER, rec.id, NodeType.DELIVERY, del.id, EdgeType.DELIVERED_IN, highlightEdges, edgeFilters);
      }
    }
  }

  private async processOrderItems(
    ids: string[], visitedNodes: Map<string, GraphNode>, visitedEdges: Map<string, GraphEdge>, nextQueue: Set<string>,
    nodeFilters: Set<string> | null, edgeFilters: Set<string> | null, highlightNodes: Set<string>, highlightEdges: Set<string>
  ) {
    if (ids.length === 0) return;
    const records = await this.repository.getOrderItemsByIds(ids);

    for (const rec of records) {
      const added = this.addNode(visitedNodes, NodeType.ORDER_ITEM, rec.id, `Item ${rec.id.slice(0, 8)}`, { quantity: rec.quantity, price: rec.price }, highlightNodes, nodeFilters);
      if (!added) continue;

      if (rec.orderId) {
        this.addEdge(visitedEdges, nextQueue, visitedNodes, NodeType.ORDER, rec.orderId, NodeType.ORDER_ITEM, rec.id, EdgeType.CONTAINS, highlightEdges, edgeFilters);
      }
      if (rec.productId) {
        this.addEdge(visitedEdges, nextQueue, visitedNodes, NodeType.ORDER_ITEM, rec.id, NodeType.PRODUCT, rec.productId, EdgeType.CONTAINS, highlightEdges, edgeFilters);
      }
    }
  }

  private async processDeliveries(
    ids: string[], visitedNodes: Map<string, GraphNode>, visitedEdges: Map<string, GraphEdge>, nextQueue: Set<string>,
    nodeFilters: Set<string> | null, edgeFilters: Set<string> | null, highlightNodes: Set<string>, highlightEdges: Set<string>
  ) {
    if (ids.length === 0) return;
    const records = await this.repository.getDeliveriesByIds(ids);

    for (const rec of records) {
      const added = this.addNode(visitedNodes, NodeType.DELIVERY, rec.id, `Delivery ${rec.id}`, { createdAt: rec.createdAt }, highlightNodes, nodeFilters);
      if (!added) continue;

      if (rec.orderId) {
        this.addEdge(visitedEdges, nextQueue, visitedNodes, NodeType.ORDER, rec.orderId, NodeType.DELIVERY, rec.id, EdgeType.DELIVERED_IN, highlightEdges, edgeFilters);
      }
      if (rec.addressId) {
        this.addEdge(visitedEdges, nextQueue, visitedNodes, NodeType.DELIVERY, rec.id, NodeType.LOCATION, rec.addressId, EdgeType.DELIVERED_TO, highlightEdges, edgeFilters);
      }
      if (rec.invoice) {
        this.addEdge(visitedEdges, nextQueue, visitedNodes, NodeType.DELIVERY, rec.id, NodeType.INVOICE, rec.invoice.id, EdgeType.INVOICED_BY, highlightEdges, edgeFilters);
      }
    }
  }

  private async processInvoices(
    ids: string[], visitedNodes: Map<string, GraphNode>, visitedEdges: Map<string, GraphEdge>, nextQueue: Set<string>,
    nodeFilters: Set<string> | null, edgeFilters: Set<string> | null, highlightNodes: Set<string>, highlightEdges: Set<string>
  ) {
    if (ids.length === 0) return;
    const records = await this.repository.getInvoicesByIds(ids);

    for (const rec of records) {
      const added = this.addNode(visitedNodes, NodeType.INVOICE, rec.id, `Invoice ${rec.id}`, { amount: rec.amount, createdAt: rec.createdAt }, highlightNodes, nodeFilters);
      if (!added) continue;

      if (rec.deliveryId) {
        this.addEdge(visitedEdges, nextQueue, visitedNodes, NodeType.DELIVERY, rec.deliveryId, NodeType.INVOICE, rec.id, EdgeType.INVOICED_BY, highlightEdges, edgeFilters);
      }
      if (rec.payment) {
        this.addEdge(visitedEdges, nextQueue, visitedNodes, NodeType.INVOICE, rec.id, NodeType.PAYMENT, rec.payment.id, EdgeType.PAID_BY, highlightEdges, edgeFilters);
      }
    }
  }

  private async processPayments(
    ids: string[], visitedNodes: Map<string, GraphNode>, visitedEdges: Map<string, GraphEdge>, nextQueue: Set<string>,
    nodeFilters: Set<string> | null, edgeFilters: Set<string> | null, highlightNodes: Set<string>, highlightEdges: Set<string>
  ) {
    if (ids.length === 0) return;
    const records = await this.repository.getPaymentsByIds(ids);

    for (const rec of records) {
      const added = this.addNode(visitedNodes, NodeType.PAYMENT, rec.id, `Payment ${rec.id.slice(0, 8)}`, { amount: rec.amount, status: rec.status, createdAt: rec.createdAt }, highlightNodes, nodeFilters);
      if (!added) continue;

      if (rec.invoiceId) {
        this.addEdge(visitedEdges, nextQueue, visitedNodes, NodeType.INVOICE, rec.invoiceId, NodeType.PAYMENT, rec.id, EdgeType.PAID_BY, highlightEdges, edgeFilters);
      }
    }
  }

  private async processProducts(
    ids: string[], visitedNodes: Map<string, GraphNode>, visitedEdges: Map<string, GraphEdge>, nextQueue: Set<string>,
    nodeFilters: Set<string> | null, edgeFilters: Set<string> | null, highlightNodes: Set<string>, highlightEdges: Set<string>
  ) {
    if (ids.length === 0) return;
    const records = await this.repository.getProductsByIds(ids);

    for (const rec of records) {
      const added = this.addNode(visitedNodes, NodeType.PRODUCT, rec.id, rec.name, { sku: rec.sku, price: rec.price }, highlightNodes, nodeFilters);
      if (!added) continue;

      for (const item of rec.orderItems) {
        this.addEdge(visitedEdges, nextQueue, visitedNodes, NodeType.ORDER_ITEM, item.id, NodeType.PRODUCT, rec.id, EdgeType.CONTAINS, highlightEdges, edgeFilters);
      }
    }
  }

  private async processLocations(
    ids: string[], visitedNodes: Map<string, GraphNode>, visitedEdges: Map<string, GraphEdge>, nextQueue: Set<string>,
    nodeFilters: Set<string> | null, edgeFilters: Set<string> | null, highlightNodes: Set<string>, highlightEdges: Set<string>
  ) {
    if (ids.length === 0) return;
    const records = await this.repository.getLocationsByIds(ids);

    for (const rec of records) {
      const label = [rec.city, rec.state, rec.country].filter(Boolean).join(", ") || rec.street;
      const added = this.addNode(visitedNodes, NodeType.LOCATION, rec.id, label, { street: rec.street, city: rec.city, state: rec.state, country: rec.country, postalCode: rec.postalCode }, highlightNodes, nodeFilters);
      if (!added) continue;

      for (const cust of rec.customers) {
        this.addEdge(visitedEdges, nextQueue, visitedNodes, NodeType.CUSTOMER, cust.id, NodeType.LOCATION, rec.id, EdgeType.LOCATED_AT, highlightEdges, edgeFilters);
      }
      for (const del of rec.deliveries) {
        this.addEdge(visitedEdges, nextQueue, visitedNodes, NodeType.DELIVERY, del.id, NodeType.LOCATION, rec.id, EdgeType.DELIVERED_TO, highlightEdges, edgeFilters);
      }
    }
  }
}

// Fallback stub to prevent query.service.ts from throwing compile errors when it arbitrarily loads the "full graph".
// Since we shifted to dynamic traversal, "buildGraph" isn't the primary export anymore.
export async function buildGraph(): Promise<GraphData> {
  throw new Error("Cannot statically build full graph; use GraphBuilderService.getGraph(root) instead.");
}
