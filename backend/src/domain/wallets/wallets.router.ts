import { Router } from 'express';
import { walletsController } from './wallets.controller';

const router = Router();
const wc = walletsController;

// ── Merchant wallet ────────────────────────────────────────────────────────
router.get('/merchant-balance/:merchantId',      wc.getMerchantBalance.bind(wc));
router.get('/merchant-transactions/:merchantId', wc.getMerchantTransactions.bind(wc));
router.post('/merchant/transfer-to-customer',    wc.merchantToCustomerTransfer.bind(wc));

// ── Customers ──────────────────────────────────────────────────────────────
router.get('/customers',  wc.getCustomers.bind(wc));
router.post('/customers', wc.createCustomer.bind(wc));

// ── Fiat wallet ────────────────────────────────────────────────────────────
router.post('/topup',                   wc.topup.bind(wc));
router.post('/topup/card',              wc.topupWithCard.bind(wc));
router.post('/debit',                   wc.debit.bind(wc));
router.get('/balance/:customerId',      wc.getBalance.bind(wc));
router.get('/transactions/:customerId', wc.getTransactions.bind(wc));

// ── Wallet-to-wallet transfer ──────────────────────────────────────────────
router.post('/transfer', wc.walletTransfer.bind(wc));

// ── Bank accounts ──────────────────────────────────────────────────────────
router.post('/bank-accounts',              wc.addBankAccount.bind(wc));
router.get('/bank-accounts/:customerId',   wc.getBankAccounts.bind(wc));

// ── Bank payouts ───────────────────────────────────────────────────────────
router.post('/bank-payout',               wc.bankPayout.bind(wc));
router.get('/bank-payouts/:customerId',   wc.getBankPayouts.bind(wc));

// ── Crypto ─────────────────────────────────────────────────────────────────
router.get('/crypto-wallets-all',                wc.getAllCustomersCryptoWallets.bind(wc));
router.get('/crypto-wallets/:customerId',      wc.getCryptoWallets.bind(wc));
router.get('/crypto-price/:cryptoCoin',        wc.getCryptoPrice.bind(wc));
router.post('/buy-crypto',                     wc.buyCryptoWithWallet.bind(wc));
router.post('/sell-crypto',                    wc.sellCrypto.bind(wc));
router.post('/swap-crypto',                    wc.swapCrypto.bind(wc));
router.get('/crypto-transactions/:customerId', wc.getCryptoTransactions.bind(wc));
router.post('/merchant/buy-crypto',            wc.buyCryptoWithMerchant.bind(wc));
router.post('/merchant/swap-crypto',           wc.swapCryptoWithMerchant.bind(wc));
router.post('/crypto-withdraw',                wc.withdrawCrypto.bind(wc));

export { router as walletsRouter };
