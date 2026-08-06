import { Router } from 'express';
import { walletsController } from './wallets.controller';

const router = Router();

// ── Merchant wallet (credited automatically when offline batch syncs) ──────
router.get('/merchant-balance/:merchantId', walletsController.getMerchantBalance);
router.get('/merchant-transactions/:merchantId', walletsController.getMerchantTransactions);

// ── Customers ──────────────────────────────────────────────────────────────
router.get('/customers', walletsController.getCustomers);
router.post('/customers', walletsController.createCustomer);

// ── Fiat wallet ────────────────────────────────────────────────────────────
router.post('/topup', walletsController.topup);
router.post('/topup/card', walletsController.topupWithCard);
router.post('/debit', walletsController.debit);
router.get('/balance/:customerId', walletsController.getBalance);
router.get('/transactions/:customerId', walletsController.getTransactions);

// ── Wallet-to-wallet transfer ──────────────────────────────────────────────
router.post('/transfer', walletsController.walletTransfer);

// ── Virtual cards ──────────────────────────────────────────────────────────
router.post('/virtual-cards/issue', walletsController.issueVirtualCard);
router.get('/virtual-cards/:customerId', walletsController.getVirtualCards);
router.post('/virtual-cards/topup', walletsController.topupVirtualCard);
router.post('/virtual-cards/freeze', walletsController.freezeVirtualCard);
router.post('/virtual-cards/unfreeze', walletsController.unfreezeVirtualCard);

// ── Bank accounts ──────────────────────────────────────────────────────────
router.post('/bank-accounts', walletsController.addBankAccount);
router.get('/bank-accounts/:customerId', walletsController.getBankAccounts);

// ── Bank payouts ───────────────────────────────────────────────────────────
router.post('/bank-payout', walletsController.bankPayout);
router.get('/bank-payouts/:customerId', walletsController.getBankPayouts);

// ── Crypto ─────────────────────────────────────────────────────────────────
router.get('/crypto-wallets/:customerId', walletsController.getCryptoWallets);
router.get('/crypto-price/:cryptoCoin', walletsController.getCryptoPrice);
router.post('/buy-crypto', walletsController.buyCryptoWithWallet);
router.post('/sell-crypto', walletsController.sellCrypto);
router.get('/crypto-transactions/:customerId', walletsController.getCryptoTransactions);
// Merchant endpoints
router.post('/merchant/buy-crypto', walletsController.buyCryptoWithMerchant);

export { router as walletsRouter };
