import { AIService } from "./ai.service";
import { GuardrailService } from "./guardrail.service";
import { prisma } from "../config/prisma";
import { GraphBuilderService } from "./graph.service";
import fs from "fs";
import path from "path";

export interface QueryResult {
  sql?: string;
  rawData?: unknown[];
  answer: string;
  graphContext?: {
    highlightNodes: string[];
    highlightEdges: Array<{ source: string; target: string }>;
  };
  status: "success" | "rejected" | "error";
  reason?: string;
}

export class QueryService {
  private aiService: AIService;
  private guardrailService: GuardrailService;
  private graphService: GraphBuilderService;

  constructor(aiService?: AIService, guardrailService?: GuardrailService, graphService?: GraphBuilderService) {
    this.aiService = aiService ?? new AIService();
    this.guardrailService = guardrailService ?? new GuardrailService();
    this.graphService = graphService ?? new GraphBuilderService();
  }

  public async orchestrateQuery(naturalQuery: string): Promise<QueryResult> {
    const startTime = Date.now();
    let generatedSql = "";

    try {
      // 1. Guardrail Input Filtering
      const inputCheck = this.guardrailService.validateNLQuery(naturalQuery);
      if (!inputCheck.safe) {
        this.log("rejected", naturalQuery, null, null, startTime, inputCheck.reason);
        return { answer: inputCheck.reason || "Query rejected.", status: "rejected", reason: inputCheck.reason };
      }

      // Check Trace Intent immediately
      const traceMatch = naturalQuery.match(/trace\s+(order|customer|invoice|delivery|payment|product|location|order_item)[_\s]*([A-Za-z0-9\-]+)/i);
      if (traceMatch) {
         const typeStr = traceMatch[1].replace("_", "").toUpperCase();
         // Map to enum equivalents
         const typeMap: any = {
           "ORDER": "ORDER",
           "CUSTOMER": "CUSTOMER",
           "INVOICE": "INVOICE",
           "DELIVERY": "DELIVERY",
           "PAYMENT": "PAYMENT",
           "PRODUCT": "PRODUCT",
           "LOCATION": "LOCATION",
           "ORDERITEM": "ORDER_ITEM" 
         };
         const rootType = typeMap[typeStr] || typeStr;
         const rootId = traceMatch[2];

         this.log("success", naturalQuery, "TRACE", null, startTime, `Tracing flow for ${rootType}: ${rootId}`);
         const graph = await this.graphService.getGraph(rootType, rootId, { depth: 5 });
         
         const highlightNodes = graph.nodes.map(n => n.id);
         const highlightEdges = graph.edges.map(e => ({ source: e.source, target: e.target }));

         return {
           answer: `Here is the flow trace for ${rootType} ${rootId}. Highlighted in the graph.`,
           rawData: [],
           graphContext: { highlightNodes, highlightEdges },
           status: "success"
         };
      }

      // 2. AI generates SQL
      generatedSql = await this.aiService.generateSQL(naturalQuery);
      console.log("\n\n--- DUMP SQL ---\n" + generatedSql + "\n----------------\n\n");
      
      // 3. Guardrail SQL Checking
      const sqlCheck = this.guardrailService.validateSQL(generatedSql);
      if (!sqlCheck.safe) {
        this.log("rejected", naturalQuery, generatedSql, null, startTime, sqlCheck.reason);
        return { sql: generatedSql, answer: "Generated SQL blocked by security guards.", status: "rejected", reason: sqlCheck.reason };
      }

      // 4. Safe Database Query Execution
      const rawData = await prisma.$queryRawUnsafe(generatedSql);
      let processedData = rawData as any[];
      
      // Zero Rows Fallback Handling
      if (!processedData || processedData.length === 0) {
         this.log("success", naturalQuery, generatedSql, 0, startTime);
         return { 
           sql: generatedSql, 
           rawData: [], 
           answer: "No data found for this query.", 
           graphContext: { highlightNodes: [], highlightEdges: [] },
           status: "success" 
         };
      } 
      
      // Safely clamp rows logic
      let truncated = false;
      if (processedData.length > 50) {
         processedData = processedData.slice(0, 50);
         truncated = true;
      }

      // Clean rows (BigInt convert)
      processedData = processedData.map(row => {
        const parsedRow: any = {};
        for (const [key, value] of Object.entries(row)) {
          parsedRow[key] = typeof value === "bigint" ? value.toString() : value;
        }
        return parsedRow;
      });

      // Identifier Extraction for graphContext highlights
      const highlightNodes = new Set<string>();
      const sqlUpper = generatedSql.toUpperCase();
      let guessTable = "";
      const tableMatch = sqlUpper.match(/FROM\s+"GRAPH_QUERY"\."([A-Z_]+)"/);
      if (tableMatch) guessTable = tableMatch[1]; // e.g. CUSTOMER

      for (const row of processedData) {
        for (const [key, val] of Object.entries(row)) {
          if (!val) continue;
          const kLower = key.toLowerCase();
          let type = "";
          if (kLower === 'customer_id' || kLower === 'customerid') type = 'CUSTOMER';
          else if (kLower === 'order_id' || kLower === 'orderid') type = 'ORDER';
          else if (kLower === 'product_id' || kLower === 'productid') type = 'PRODUCT';
          else if (kLower === 'delivery_id' || kLower === 'deliveryid') type = 'DELIVERY';
          else if (kLower === 'invoice_id' || kLower === 'invoiceid') type = 'INVOICE';
          else if (kLower === 'payment_id' || kLower === 'paymentid') type = 'PAYMENT';
          else if (kLower === 'address_id' || kLower === 'addressid') type = 'LOCATION';
          else if (kLower === 'id' && guessTable) type = guessTable;

          if (type && (typeof val === 'string' || typeof val === 'number')) {
             highlightNodes.add(`${type}:${val}`);
          }
        }
      }

      // 5. AI formatting answer
      const finalAnswer = await this.aiService.generateAnswer(naturalQuery, processedData);

      this.log("success", naturalQuery, generatedSql, processedData.length, startTime, truncated ? "Truncated to 50 rows." : undefined);
      return {
        sql: generatedSql,
        rawData: processedData,
        answer: finalAnswer,
        graphContext: {
          highlightNodes: Array.from(highlightNodes),
          highlightEdges: [] // aggregation queries usually just map nodes
        },
        status: "success",
      };

    } catch (err) {
      console.error("\n\n--- FAILED SQL ---\n" + generatedSql + "\n----------------\n\n");
      this.log("error", naturalQuery, null, null, startTime, (err as Error).message);
      
      try {
        const logDir = path.join(process.cwd(), "logs");
        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true });
        }
        const logFile = path.join(logDir, "query.service.ts_error.log");
        const logEntry = `[${new Date().toISOString()}]
Natural Language Query: ${naturalQuery}
Generated SQL:
${generatedSql || "None"}
Error Message: ${(err as Error).message}
--------------------------------------------------\n`;
        fs.appendFileSync(logFile, logEntry);
      } catch (logErr) {
        console.error("Failed to write to error log file", logErr);
      }

      return { 
        answer: "Something went wrong while processing the request.", 
        status: "error", 
        reason: (err as Error).message + (generatedSql ? " SQL: " + generatedSql : "")
      };
    }
  }

  // Structured Logging Method
  private log(
    status: string,
    query: string,
    sql: string | null = null,
    rowCount: number | null = null,
    startTime: number,
    message?: string
  ): void {
    console.log(
      JSON.stringify({
        step: "query_service_orchestrator",
        status,
        query,
        sql,
        rowCount,
        executionTimeMs: Date.now() - startTime,
        errorMessage: status === "error" ? message : undefined,
        message: status !== "error" ? message : undefined,
        timestamp: new Date().toISOString()
      })
    );
  }
}
