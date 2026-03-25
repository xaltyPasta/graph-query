import { Router, Request, Response } from "express";
import { QueryController } from "../controllers/query.controller";

const router = Router();
const queryController = new QueryController();

router.post("/", async (req: Request, res: Response) => {
  await queryController.handleQuery(req, res);
});

export default router;
