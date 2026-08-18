import { StandardPii } from './binance.service';

export type ExchangeProviderId =
  | 'transak'
  | 'kucoin' | 'binance'
  | 'tronweb' | 'tronweb-treasury'
  | 'bscweb'  | 'bscweb-treasury'
  | 'polygonweb' | 'polygonweb-treasury';

export type CryptoNetwork =
  | 'TRX' | 'TRC20' | 'TRON'
  | 'BSC' | 'BEP20' | 'BSC_BEP20'
  | 'POLYGON' | 'MATIC' | 'ERC20_POLYGON'
  | 'ETH' | 'ERC20' | 'ETHEREUM'
  | 'SOL' | 'SOLANA'
  | 'BTC' | 'BITCOIN';

export interface BuyAssetResult {
  ok: boolean;
  provider: ExchangeProviderId;
  asset: string;
  amount_usd: number;
  executed_qty: number;
  executedQty: number;
  fills?: Array<{ qty: string; price: string }>;
  status: string;
  order_id?: string;
  raw?: any;
}

export interface SellAssetResult {
  ok: boolean;
  provider: ExchangeProviderId;
  asset: string;
  amount_sold: number;
  executed_qty: number;
  executedQty: number;
  usdt_received: number;
  fills?: Array<{ qty: string; price: string }>;
  status: string;
  order_id?: string;
  raw?: any;
}

export interface WithdrawAssetResult {
  ok: boolean;
  provider: ExchangeProviderId | 'manual';
  id?: string;
  trId?: number | string;
  withdrawId?: string;
  txId?: string;
  accepted?: boolean;
  info?: string;
  txUrl?: string | null;
  raw?: any;
}

export interface WithdrawOptions {
  questionnaire?: Record<string, any> | string;
  withdrawOrderId?: string;
  originatorPii?: StandardPii;
  addressTag?: string;
  addressName?: string;
  transactionFeeFlag?: boolean;
  walletType?: 0 | 1;
  recvWindow?: number;
  networkOverride?: string;
  useBrokerEndpoint?: boolean;
}

export interface GetPriceResult {
  priceUsd: number;
  provider: ExchangeProviderId | 'coingecko' | 'fallback';
  symbol: string;
  timestamp: number;
  raw?: any;
}

export interface ExchangeProvider {
  readonly id: ExchangeProviderId;
  readonly name: string;

  isConfigured(): boolean;
  getPrice(coin: string): Promise<GetPriceResult>;

  buyAssetWithUsd(asset: string, amountUsd: number): Promise<BuyAssetResult>;
  sellAssetForUsdt(asset: string, amountBase: number): Promise<SellAssetResult>;

  withdrawAsset(
    asset: string,
    address: string,
    network: string,
    amount: number,
    opts?: WithdrawOptions
  ): Promise<WithdrawAssetResult>;

  supportsNetwork(network: string, asset?: string): boolean;
  hasDirectBlockchainRail?(): boolean;
}
