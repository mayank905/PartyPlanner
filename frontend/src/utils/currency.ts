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

export function formatCurrency(amount: number, currency: CurrencyCode = 'INR'): string {
  const locale = LOCALE_MAP[currency] || 'en-IN';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(Math.round(amount));
  } catch {
    return `${CURRENCY_SYMBOL_MAP[currency] || '₹'}${Math.round(amount).toLocaleString('en-IN')}`;
  }
}
