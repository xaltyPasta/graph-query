import { Router, Request, Response } from "express";
import { GraphController } from "../controllers/graph.controller";

const router = Router();
const graphController = new GraphController();

router.get("/", async (req: Request, res: Response) => {
  await graphController.getGraph(req, res);
});

export default router;
