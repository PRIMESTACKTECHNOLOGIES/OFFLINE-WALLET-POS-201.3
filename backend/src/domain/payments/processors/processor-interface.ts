export interface ProcessorResult {
  success: boolean;
  status: 'AUTHORIZED' | 'CAPTURED' | 'SETTLED' | 'FAILED' | 'REVERSED';
  processorId?: string;
  authCode?: string;
  message?: string;
}

export interface PaymentProcessor {
  authorize(amountMinor: number, currency: string, metadata?: Record<string, unknown>): Promise<ProcessorResult>;
  capture(processorId: string, amountMinor?: number): Promise<ProcessorResult>;
  refund(processorId: string, amountMinor?: number): Promise<ProcessorResult>;
}
