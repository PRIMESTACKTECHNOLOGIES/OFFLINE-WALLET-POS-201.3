import { db } from "../../config/db";
import { v4 as uuidv4 } from "uuid";

export class PaymentReceiverService {
  async receive(payload: any) {
    const id = uuidv4();
    const now = new Date().toISOString();
    await db.query(
      `INSERT INTO incoming_payments (id, source, payload, received_at) VALUES (?, ?, ?, ?)`,
      [id, payload.source || 'unknown', JSON.stringify(payload), now]
    );
    return { id, receivedAt: now };
  }

  async list(limit = 100) {
    const res = await db.query(`SELECT id, source, payload, received_at FROM incoming_payments ORDER BY received_at DESC LIMIT ?`, [limit]);
    return res.rows.map((r: any) => ({ id: r.id, source: r.source, payload: JSON.parse(r.payload), receivedAt: r.received_at }));
  }
}

export const paymentReceiverService = new PaymentReceiverService();
