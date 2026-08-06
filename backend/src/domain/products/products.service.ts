import { db } from "../../config/db";
import { v4 as uuidv4 } from "uuid";

export class ProductsService {
  async listProducts(merchantId?: string) {
    const params: any[] = [];
    let where = "";
    if (merchantId) { where = "WHERE merchant_id = ?"; params.push(merchantId); }

    const res = await db.query(
      `SELECT id, sku, name, price_minor, stock, merchant_id, updated_at FROM products ${where} ORDER BY updated_at DESC LIMIT 500`,
      params
    );
    return res.rows || [];
  }

  async createProduct(data: any) {
    const id = uuidv4();
    const { merchantId = 'MRC-1001', sku = '', name = '', price_minor = 0, stock = 0 } = data;
    await db.query(`INSERT INTO products (id, merchant_id, sku, name, price_minor, stock, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, merchantId, sku, name, price_minor, stock, new Date().toISOString(), new Date().toISOString()]);
    return { id, merchantId, sku, name, price_minor, stock };
  }
}

export const productsService = new ProductsService();
