import React, { useEffect, useState } from 'react';
import './CryptoHoldingsCard.css';

export interface CryptoBalance {
  coin: string;
  network: string;
  quantity: number;
  value_usd: number;
  percent_of_portfolio: number;
  address: string;
}

interface CryptoHoldingsCardProps {
  holdings: CryptoBalance[];
  onSwap?: (coin: string, network: string) => void;
  onSell?: (coin: string, network: string) => void;
  onWithdraw?: (coin: string, network: string) => void;
}

const CryptoHoldingsCard: React.FC<CryptoHoldingsCardProps> = ({
  holdings = [],
  onSwap,
  onSell,
  onWithdraw,
}) => {
  const [expanded, setExpanded] = useState(false);

  const getCoinIcon = (coin: string): string => {
    const icons: Record<string, string> = {
      BTC: '₿',
      ETH: 'Ξ',
      USDT: '₮',
      USDC: '◎',
      SOL: '◎',
      BNB: '◀',
      MATIC: 'M',
    };
    return icons[coin.toUpperCase()] || '◆';
  };

  const totalCryptoValue = holdings.reduce((sum, h) => sum + (h.value_usd || 0), 0);

  return (
    <div className="crypto-holdings-card">
      <div className="card-header" onClick={() => setExpanded(!expanded)}>
        <div className="header-left">
          <h3>Crypto Holdings</h3>
          <span className="total-value">${totalCryptoValue.toFixed(2)}</span>
        </div>
        <div className="header-right">
          <span className="coin-count">{holdings.length} coins</span>
          <span className="expand-icon">{expanded ? '▼' : '▶'}</span>
        </div>
      </div>

      {expanded && (
        <div className="card-content">
          {holdings.length === 0 ? (
            <div className="empty-state">
              <p>No crypto holdings yet</p>
              <small>Buy crypto using your wallet balance or via Transak</small>
            </div>
          ) : (
            <div className="holdings-list">
              {holdings.map((holding, idx) => (
                <div key={`${holding.coin}-${holding.network}-${idx}`} className="holding-row">
                  <div className="holding-info">
                    <div className="coin-icon">{getCoinIcon(holding.coin)}</div>
                    <div className="coin-details">
                      <div className="coin-name">
                        {holding.coin}
                        <span className="network-badge">{holding.network}</span>
                      </div>
                      <div className="quantity">
                        {holding.quantity.toFixed(8)} {holding.coin}
                      </div>
                      <div className="address-truncated">
                        {holding.address.slice(0, 10)}...{holding.address.slice(-8)}
                      </div>
                    </div>
                  </div>

                  <div className="holding-value">
                    <div className="usd-value">${holding.value_usd.toFixed(2)}</div>
                    <div className="percentage">{holding.percent_of_portfolio.toFixed(1)}%</div>
                  </div>

                  <div className="holding-actions">
                    {onSwap && (
                      <button
                        className="action-btn swap-btn"
                        onClick={() => onSwap(holding.coin, holding.network)}
                        title="Swap to another crypto"
                      >
                        ⇆
                      </button>
                    )}
                    {onSell && (
                      <button
                        className="action-btn sell-btn"
                        onClick={() => onSell(holding.coin, holding.network)}
                        title="Sell this crypto"
                      >
                        $
                      </button>
                    )}
                    {onWithdraw && (
                      <button
                        className="action-btn withdraw-btn"
                        onClick={() => onWithdraw(holding.coin, holding.network)}
                        title="Withdraw to external wallet"
                      >
                        ↗
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CryptoHoldingsCard;
