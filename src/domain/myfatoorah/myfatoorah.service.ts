// src/domain/myfatoorah/myfatoorah.service.ts
import { db } from "../../config/db";

// MyFatoorah API configuration
const MYFATOORAH_BASE_URL = process.env.MYFATOORAH_TEST_MODE === "true" 
  ? "https://apitest.myfatoorah.com/" 
  : "https://api.myfatoorah.com/";

const MYFATOORAH_API_KEY = process.env.MYFATOORAH_API_KEY || "";

export interface MyFatoorahPaymentData {
  invoiceId: number;
  invoiceReference: string;
  customerName: string;
  customerMobile: string;
  transactionDate: string;
  paymentGateway: string;
  referenceId: string;
  trackId: string;
  transactionId: string;
  paymentId: string;
  authorizationId: string;
  amount: number;
  rawData: any;
}

export interface CreatePaymentData {
  amount: number;
  customerName?: string;
  customerMobile?: string;
  description?: string;
  reference?: string;
}

export class MyFatoorahService {
  
  /**
   * Process payment webhook and save to YOUR SQL database
   */
  async processPayment(data: MyFatoorahPaymentData): Promise<void> {
    console.log("[MyFatoorahService] Processing payment:", data.invoiceId);
    
    // Save to your PostgreSQL database
    await db.query(
      `INSERT INTO myfatoorah_payments (
        invoice_id, 
        invoice_reference, 
        customer_name, 
        customer_mobile,
        transaction_date,
        payment_gateway,
        reference_id,
        track_id,
        transaction_id,
        payment_id,
        authorization_id,
        amount,
        status,
        raw_webhook_data,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
      ON CONFLICT (invoice_id) DO UPDATE SET
        status = $13,
        updated_at = NOW()`,
      [
        data.invoiceId,
        data.invoiceReference,
        data.customerName,
        data.customerMobile,
        data.transactionDate,
        data.paymentGateway,
        data.referenceId,
        data.trackId,
        data.transactionId,
        data.paymentId,
        data.authorizationId,
        data.amount,
        "PAID",
        JSON.stringify(data.rawData)
      ]
    );

    // Also update related order if exists
    if (data.invoiceReference) {
      await db.query(
        `UPDATE offline_orders 
         SET status = 'PAID', 
             paid_at = NOW(),
             myfatoorah_invoice_id = $1
         WHERE order_id = $2`,
        [data.invoiceId, data.invoiceReference]
      );
    }

    console.log("[MyFatoorahService] Payment saved to database");
  }

  /**
   * Create new payment via MyFatoorah API
   */
  async createPayment(data: CreatePaymentData): Promise<any> {
    if (!MYFATOORAH_API_KEY) {
      throw new Error("MyFatoorah API key not configured");
    }

    const requestBody = {
      InvoiceValue: data.amount,
      CustomerName: data.customerName || "Customer",
      CustomerMobile: data.customerMobile || "",
      CustomerReference: data.reference || `ORD-${Date.now()}`,
      DisplayCurrencyIso: "AED",
      Language: "EN",
      CallBackUrl: `${process.env.BACKEND_URL}/api/myfatoorah/callback`,
      ErrorUrl: `${process.env.BACKEND_URL}/api/myfatoorah/error`
    };

    const response = await fetch(`${MYFATOORAH_BASE_URL}v2/SendPayment`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MYFATOORAH_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });

    const result = await response.json();
    
    if (!result.IsSuccess) {
      throw new Error(result.Message || "Failed to create payment");
    }

    // Save pending payment to database
    await db.query(
      `INSERT INTO myfatoorah_payments (
        invoice_id,
        invoice_reference,
        customer_name,
        customer_mobile,
        amount,
        status,
        payment_url,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        result.Data.InvoiceId,
        data.reference,
        data.customerName,
        data.customerMobile,
        data.amount,
        "PENDING",
        result.Data.InvoiceURL
      ]
    );

    return {
      invoiceId: result.Data.InvoiceId,
      paymentUrl: result.Data.InvoiceURL,
      reference: data.reference
    };
  }

  /**
   * Check payment status from MyFatoorah API
   */
  async checkPaymentStatus(invoiceId: string): Promise<any> {
    if (!MYFATOORAH_API_KEY) {
      throw new Error("MyFatoorah API key not configured");
    }

    const response = await fetch(
      `${MYFATOORAH_BASE_URL}v2/GetPaymentStatus?Key=${invoiceId}&KeyType=InvoiceId`,
      {
        headers: {
          "Authorization": `Bearer ${MYFATOORAH_API_KEY}`
        }
      }
    );

    const result = await response.json();
    return result;
  }

  /**
   * Get all payments from YOUR database
   */
  async getPayments(merchantId: string): Promise<any[]> {
    const result = await db.query(
      `SELECT * FROM myfatoorah_payments 
       ORDER BY created_at DESC 
       LIMIT 100`
    );
    return result.rows;
  }
}

export const myfatoorahService = new MyFatoorahService();
