import React, { useState, useEffect } from 'react';
import './BuyCryptoModal.css';

interface BuyCryptoModalProps {
  customerId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (orderId: string) => void;
  onError?: (error: string) => void;
}

interface BuyCryptoFormData {
  amount_usd: number;
  crypto_currency: string;
  network: string;
  payment_method: 'transak' | 'wallet_balance';
}

const BuyCryptoModal: React.FC<BuyCryptoModalProps> = ({
  customerId,
  isOpen,
  onClose,
  onSuccess,
  onError,
}) => {
  const [formData, setFormData] = useState<BuyCryptoFormData>({
    amount_usd: 100,
    crypto_currency: 'USDT',
    network: 'tron',
    payment_method: 'transak',
  });

  const [loading, setLoading] = useState(false);
  const [transakUrl, setTransakUrl] = useState<string>('');
  const [orderId, setOrderId] = useState<string>('');

  const cryptoOptions = [
    { label: 'USDT (Tether)', value: 'USDT', networks: ['tron', 'ethereum', 'bsc', 'polygon'] },
    { label: 'BTC (Bitcoin)', value: 'BTC', networks: ['bitcoin'] },
    { label: 'ETH (Ethereum)', value: 'ETH', networks: ['ethereum'] },
    { label: 'SOL (Solana)', value: 'SOL', networks: ['solana'] },
    { label: 'BNB (Binance Coin)', value: 'BNB', networks: ['bsc'] },
  ];

  const selectedCrypto = cryptoOptions.find(c => c.value === formData.crypto_currency);
  const availableNetworks = selectedCrypto?.networks || [];

  const handleInputChange = (field: string, value: any) => {
    const newFormData = { ...formData, [field]: value };

    // Reset network if it's not available for selected crypto
    if (field === 'crypto_currency' && !availableNetworks.includes(newFormData.network)) {
      newFormData.network = availableNetworks[0] || 'tron';
    }

    setFormData(newFormData);
  };

  const handleInitiateBuy = async () => {
    if (!formData.amount_usd || formData.amount_usd < 10) {
      onError?.('Minimum purchase is $10');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/crypto/wallets/${customerId}/buy-crypto`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error('Failed to initiate purchase');
      }

      const result = await response.json();

      if (result.success && result.transak_url) {
        setOrderId(result.order_id);
        setTransakUrl(result.transak_url);
      } else {
        throw new Error(result.error || 'Unknown error');
      }
    } catch (err: any) {
      console.error('Failed to initiate buy crypto:', err);
      onError?.(err.message || 'Failed to initiate purchase');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content buy-crypto-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Buy Crypto</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        {!transakUrl ? (
          <div className="modal-body">
            <div className="form-group">
              <label>Amount (USD)</label>
              <div className="amount-input">
                <input
                  type="number"
                  min="10"
                  step="1"
                  value={formData.amount_usd}
                  onChange={(e) => handleInputChange('amount_usd', parseFloat(e.target.value))}
                  placeholder="Enter amount in USD"
                  disabled={loading}
                />
                <span className="currency">USD</span>
              </div>
              <small>Minimum: $10</small>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Crypto</label>
                <select
                  value={formData.crypto_currency}
                  onChange={(e) => handleInputChange('crypto_currency', e.target.value)}
                  disabled={loading}
                >
                  {cryptoOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Network</label>
                <select
                  value={formData.network}
                  onChange={(e) => handleInputChange('network', e.target.value)}
                  disabled={loading}
                >
                  {availableNetworks.map((net) => (
                    <option key={net} value={net}>
                      {net.charAt(0).toUpperCase() + net.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Payment Method</label>
              <div className="payment-methods">
                <label className="payment-option">
                  <input
                    type="radio"
                    value="transak"
                    checked={formData.payment_method === 'transak'}
                    onChange={(e) => handleInputChange('payment_method', e.target.value)}
                    disabled={loading}
                  />
                  <span>Pay with Transak</span>
                  <small>Google Pay, Credit Card, Bank Transfer</small>
                </label>
                <label className="payment-option">
                  <input
                    type="radio"
                    value="wallet_balance"
                    checked={formData.payment_method === 'wallet_balance'}
                    onChange={(e) => handleInputChange('payment_method', e.target.value)}
                    disabled={loading}
                  />
                  <span>Pay from Wallet</span>
                  <small>Instant USD debit from your wallet</small>
                </label>
              </div>
            </div>

            <div className="info-box">
              <p>
                💡 You'll receive approximately{' '}
                <strong>{(formData.amount_usd / 1).toFixed(2)} {formData.crypto_currency}</strong> (price may vary)
              </p>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={onClose} disabled={loading}>
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleInitiateBuy}
                disabled={loading}
              >
                {loading ? 'Processing...' : 'Continue'}
              </button>
            </div>
          </div>
        ) : (
          <div className="modal-body transak-payment">
            <div className="success-icon">✓</div>
            <h3>Payment in Progress</h3>
            <p>Complete your purchase on Transak</p>
            <a
              href={transakUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary btn-open-transak"
            >
              Open Transak →
            </a>
            <p className="order-id">Order ID: {orderId}</p>
            <div className="info-box">
              <p>
                📝 You can close this window. We'll notify you when your purchase is complete.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BuyCryptoModal;
