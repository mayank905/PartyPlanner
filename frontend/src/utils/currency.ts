import { CurrencyCode } from '../types/domain';

const LOCALE_MAP: Record<CurrencyCode, string> = {
  INR: 'en-IN',
  USD: 'en-US',
  EUR: 'de-DE',
  GBP: 'en-GB',
};

export const CURRENCY_SYMBOL_MAP: Record<CurrencyCode, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
};

const FORMATTER_CACHE = new Map<CurrencyCode, Intl.NumberFormat>();

function getCurrencyFormatter(currency: CurrencyCode): Intl.NumberFormat {
  let formatter = FORMATTER_CACHE.get(currency);
  if (!formatter) {
    const locale = LOCALE_MAP[currency] || 'en-IN';
    formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    });
    FORMATTER_CACHE.set(currency, formatter);
  }
  return formatter;
}

export function formatCurrency(amount: number, currency: CurrencyCode = 'INR'): string {
  try {
    return getCurrencyFormatter(currency).format(Math.round(amount));
  } catch {
    return `${CURRENCY_SYMBOL_MAP[currency] || '₹'}${Math.round(amount).toLocaleString('en-IN')}`;
  }
}
