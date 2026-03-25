import { Request, Response } from "express";
import { QueryService } from "../services/query.service";

const queryService = new QueryService();

export class QueryController {
  public async handleQuery(req: Request, res: Response): Promise<void> {
    const startTime = Date.now();
    try {
      const { query } = req.body;

      if (!query || typeof query !== "string") {
        res.status(400).json({ error: "A valid 'query' string is required in the request body." });
        return;
      }

      // 1. Send it through the orchestrator
      const result = await queryService.orchestrateQuery(query);

      // 2. Build structured API response
      const apiResponse = {
        answer: result.answer,
        sql: result.sql,
        rawData: result.rawData,
        graphContext: result.graphContext,
        meta: {
          status: result.status,
          executionTimeMs: Date.now() - startTime,
          reason: result.reason,
        },
      };

      if (result.status === "rejected") {
        res.status(400).json(apiResponse);
        return;
      }

      if (result.status === "error") {
        res.status(500).json(apiResponse);
        return;
      }

      res.status(200).json(apiResponse);
    } catch (err) {
      console.error(
        JSON.stringify({
          step: "natural_language_query",
          status: "fatal",
          error: (err as Error).message,
        })
      );
      res.status(500).json({ error: "Internal Server Error processing query." });
    }
  }
}
