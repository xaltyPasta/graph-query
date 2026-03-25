import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import graphRoutes from "./routes/graph.routes";
import queryRoutes from "./routes/query.routes";

const app = express();
const PORT = process.env.PORT ?? 5000;

app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => res.json({ status: "OK", message: "Graph Query API" }));
app.use("/api/graph", graphRoutes);
app.use("/api/query", queryRoutes);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message ?? "Internal Server Error" });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
