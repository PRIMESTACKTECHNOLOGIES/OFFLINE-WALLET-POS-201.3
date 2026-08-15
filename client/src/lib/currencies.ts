/**
 * Global currency + country registry for EMV terminal configuration.
 * ISO 4217 currency codes and ISO 3166-1 numeric country codes.
 * Used to build correct TLV tags for EMV transaction processing.
 */

export interface CurrencyConfig {
  code: string;          // ISO 4217 e.g. "USD"
  name: string;          // Display name
  symbol: string;        // e.g. "$"
  numericCode: string;   // ISO 4217 numeric as 4-hex e.g. "0348"
  decimals: number;      // Minor units e.g. 2 for cents
  countryCode: string;   // ISO 3166-1 numeric as 4-hex (primary country)
  countryName: string;
  flag: string;          // Emoji flag
}

export const CURRENCIES: CurrencyConfig[] = [
  { code: 'USD', name: 'US Dollar',           symbol: '$',   numericCode: '0840', decimals: 2, countryCode: '0840', countryName: 'United States',   flag: '🇺🇸' },
  { code: 'EUR', name: 'Euro',                symbol: '€',   numericCode: '0978', decimals: 2, countryCode: '0276', countryName: 'Germany / EU',    flag: '🇪🇺' },
  { code: 'GBP', name: 'British Pound',       symbol: '£',   numericCode: '0826', decimals: 2, countryCode: '0826', countryName: 'United Kingdom',  flag: '🇬🇧' },
  { code: 'AED', name: 'UAE Dirham',          symbol: 'د.إ', numericCode: '0784', decimals: 2, countryCode: '0784', countryName: 'United Arab Emirates', flag: '🇦🇪' },
  { code: 'SAR', name: 'Saudi Riyal',         symbol: '﷼',   numericCode: '0682', decimals: 2, countryCode: '0682', countryName: 'Saudi Arabia',    flag: '🇸🇦' },
  { code: 'CAD', name: 'Canadian Dollar',     symbol: 'CA$', numericCode: '0124', decimals: 2, countryCode: '0124', countryName: 'Canada',          flag: '🇨🇦' },
  { code: 'AUD', name: 'Australian Dollar',   symbol: 'A$',  numericCode: '0036', decimals: 2, countryCode: '0036', countryName: 'Australia',       flag: '🇦🇺' },
  { code: 'INR', name: 'Indian Rupee',        symbol: '₹',   numericCode: '0356', decimals: 2, countryCode: '0356', countryName: 'India',           flag: '🇮🇳' },
  { code: 'JPY', name: 'Japanese Yen',        symbol: '¥',   numericCode: '0392', decimals: 0, countryCode: '0392', countryName: 'Japan',           flag: '🇯🇵' },
  { code: 'CNY', name: 'Chinese Yuan',        symbol: '¥',   numericCode: '0156', decimals: 2, countryCode: '0156', countryName: 'China',           flag: '🇨🇳' },
  { code: 'CHF', name: 'Swiss Franc',         symbol: 'Fr',  numericCode: '0756', decimals: 2, countryCode: '0756', countryName: 'Switzerland',     flag: '🇨🇭' },
  { code: 'SGD', name: 'Singapore Dollar',    symbol: 'S$',  numericCode: '0702', decimals: 2, countryCode: '0702', countryName: 'Singapore',       flag: '🇸🇬' },
  { code: 'HKD', name: 'Hong Kong Dollar',    symbol: 'HK$', numericCode: '0344', decimals: 2, countryCode: '0344', countryName: 'Hong Kong',       flag: '🇭🇰' },
  { code: 'MYR', name: 'Malaysian Ringgit',   symbol: 'RM',  numericCode: '0458', decimals: 2, countryCode: '0458', countryName: 'Malaysia',        flag: '🇲🇾' },
  { code: 'THB', name: 'Thai Baht',           symbol: '฿',   numericCode: '0764', decimals: 2, countryCode: '0764', countryName: 'Thailand',        flag: '🇹🇭' },
  { code: 'TRY', name: 'Turkish Lira',        symbol: '₺',   numericCode: '0949', decimals: 2, countryCode: '0792', countryName: 'Turkey',          flag: '🇹🇷' },
  { code: 'BRL', name: 'Brazilian Real',      symbol: 'R$',  numericCode: '0986', decimals: 2, countryCode: '0076', countryName: 'Brazil',          flag: '🇧🇷' },
  { code: 'MXN', name: 'Mexican Peso',        symbol: 'Mex$',numericCode: '0484', decimals: 2, countryCode: '0484', countryName: 'Mexico',          flag: '🇲🇽' },
  { code: 'ZAR', name: 'South African Rand',  symbol: 'R',   numericCode: '0710', decimals: 2, countryCode: '0710', countryName: 'South Africa',    flag: '🇿🇦' },
  { code: 'NGN', name: 'Nigerian Naira',      symbol: '₦',   numericCode: '0566', decimals: 2, countryCode: '0566', countryName: 'Nigeria',         flag: '🇳🇬' },
  { code: 'KWD', name: 'Kuwaiti Dinar',       symbol: 'KD',  numericCode: '0414', decimals: 3, countryCode: '0414', countryName: 'Kuwait',          flag: '🇰🇼' },
  { code: 'QAR', name: 'Qatari Riyal',        symbol: 'QR',  numericCode: '0634', decimals: 2, countryCode: '0634', countryName: 'Qatar',           flag: '🇶🇦' },
  { code: 'OMR', name: 'Omani Rial',          symbol: 'RO',  numericCode: '0512', decimals: 3, countryCode: '0512', countryName: 'Oman',            flag: '🇴🇲' },
  { code: 'EGP', name: 'Egyptian Pound',      symbol: 'E£',  numericCode: '0818', decimals: 2, countryCode: '0818', countryName: 'Egypt',           flag: '🇪🇬' },
  { code: 'PKR', name: 'Pakistani Rupee',     symbol: '₨',   numericCode: '0586', decimals: 2, countryCode: '0586', countryName: 'Pakistan',        flag: '🇵🇰' },
  { code: 'BDT', name: 'Bangladeshi Taka',    symbol: '৳',   numericCode: '0050', decimals: 2, countryCode: '0050', countryName: 'Bangladesh',      flag: '🇧🇩' },
  { code: 'IDR', name: 'Indonesian Rupiah',   symbol: 'Rp',  numericCode: '0360', decimals: 2, countryCode: '0360', countryName: 'Indonesia',       flag: '🇮🇩' },
  { code: 'PHP', name: 'Philippine Peso',     symbol: '₱',   numericCode: '0608', decimals: 2, countryCode: '0608', countryName: 'Philippines',     flag: '🇵🇭' },
  { code: 'KRW', name: 'South Korean Won',    symbol: '₩',   numericCode: '0410', decimals: 0, countryCode: '0410', countryName: 'South Korea',     flag: '🇰🇷' },
  { code: 'NZD', name: 'New Zealand Dollar',  symbol: 'NZ$', numericCode: '0554', decimals: 2, countryCode: '0554', countryName: 'New Zealand',     flag: '🇳🇿' },
];

/** Get currency config by ISO code (e.g. "USD") */
export function getCurrency(code: string): CurrencyConfig {
  return CURRENCIES.find(c => c.code === code) ?? CURRENCIES[0]; // default USD
}

/** Format amount as display string */
export function formatAmount(amount: number, currencyCode: string): string {
  const c = getCurrency(currencyCode);
  if (c.decimals === 0) return `${c.symbol}${Math.round(amount).toLocaleString()}`;
  return `${c.symbol}${amount.toFixed(c.decimals)}`;
}

/** Convert amount to minor units (e.g. 1.50 USD → 150 cents) */
export function toMinorUnits(amount: number, currencyCode: string): number {
  const c = getCurrency(currencyCode);
  return Math.round(amount * Math.pow(10, c.decimals));
}

/** Get saved terminal currency from localStorage (set in Settings) */
export function getTerminalCurrency(): string {
  return localStorage.getItem('terminal_currency') || 'USD';
}

/** Save terminal currency to localStorage */
export function setTerminalCurrency(code: string): void {
  localStorage.setItem('terminal_currency', code);
}
