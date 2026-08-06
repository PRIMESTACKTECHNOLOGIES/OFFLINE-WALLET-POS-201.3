import { Request, Response } from "express";
import { productsService } from "./products.service";

class ProductsController {
  async list(req: Request, res: Response) {
    try {
      const merchantId = req.query.merchantId as string | undefined;
      const rows = await productsService.listProducts(merchantId);
      res.json(rows);
    } catch (e: any) {
      console.error('Products list error:', e);
      res.status(500).json({ error: 'Failed to list products' });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const data = req.body;
      const row = await productsService.createProduct(data);
      res.status(201).json(row);
    } catch (e: any) {
      console.error('Products create error:', e);
      res.status(500).json({ error: 'Failed to create product' });
    }
  }
}

export const productsController = new ProductsController();
