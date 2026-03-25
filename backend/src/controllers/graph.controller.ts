import { Request, Response } from "express";
import { GraphBuilderService } from "../services/graph.service";
import { prisma } from "../config/prisma";

const graphService = new GraphBuilderService();

export class GraphController {
  public async getGraph(req: Request, res: Response): Promise<void> {
    const startTime = Date.now();
    try {
      let { rootType, rootId, depth, highlightNodes, highlightEdges, nodeTypes, edgeTypes } = req.query;

      if (!rootType || !rootId) {
        const defaultOrder = await prisma.order.findFirst();
        if (defaultOrder) {
          rootType = "Order";
          rootId = defaultOrder.id;
        } else {
          res.status(400).json({ error: "rootType and rootId are required, and no default item was found." });
          return;
        }
      }

      const parsedDepth = depth ? parseInt(depth as string, 10) : 3;

      const options = {
        depth: isNaN(parsedDepth) ? 3 : parsedDepth,
        nodeTypes: nodeTypes ? (nodeTypes as string).split(",") : undefined,
        edgeTypes: edgeTypes ? (edgeTypes as string).split(",") : undefined,
        highlightNodeIds: highlightNodes ? (highlightNodes as string).split(",") : undefined,
        highlightEdgeIds: highlightEdges ? (highlightEdges as string).split(",") : undefined,
      };

      const graph = await graphService.getGraph(rootType as string, rootId as string, options);

      const executionTimeMs = Date.now() - startTime;

      // Structured logging at the service level per requirements
      console.log(
        JSON.stringify({
          step: "graph_generation",
          rootType,
          rootId,
          depth: options.depth,
          nodeCount: graph.nodes.length,
          edgeCount: graph.edges.length,
          executionTimeMs,
          status: "success",
        })
      );

      res.status(200).json({
        graph,
        meta: {
          executionTimeMs,
          counts: {
            nodes: graph.nodes.length,
            edges: graph.edges.length,
          },
        },
      });
    } catch (err) {
      const execTime = Date.now() - startTime;
      console.error(
        JSON.stringify({
          step: "graph_generation",
          rootType: req.query.rootType,
          rootId: req.query.rootId,
          executionTimeMs: execTime,
          status: "failed",
          error: (err as Error).message,
        })
      );
      res.status(500).json({ error: "Failed to generate graph" });
    }
  }
}
