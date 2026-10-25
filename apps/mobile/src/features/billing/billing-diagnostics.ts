import type { BillingPlan, IntroEligibilityStatus } from './billing-model';

export type BillingEligibilityDiagnosticStatus = IntroEligibilityStatus | 'pending' | 'request_failed';

export type BillingProductDiagnostic = {
  planId: BillingPlan['id'];
  packageIdentifier: string;
  productIdentifier: string;
  numericPrice: number;
  currencyCode: string;
  priceString: string;
  pricePerMonthString: string | null;
  pricePerYearString: string | null;
  eligibility: BillingEligibilityDiagnosticStatus;
};

export type BillingDiagnostics = {
  purchaseChannel: 'app_store_sandbox';
  purchasesEnabled: boolean;
  providerAvailable: boolean;
  eligibilityRequest: 'pending' | 'completed' | 'failed';
  eligibilityError: string | null;
  products: BillingProductDiagnostic[];
};

function value(value: string | number | null): string {
  return value === null || value === '' ? 'not reported' : String(value);
}

export function formatBillingDiagnostics(diagnostics: BillingDiagnostics): string {
  const lines = [
    'Vital TestFlight subscription diagnostics',
    `Purchase channel: ${diagnostics.purchaseChannel}`,
    `Purchases enabled: ${diagnostics.purchasesEnabled ? 'yes' : 'no'}`,
    `Provider available: ${diagnostics.providerAvailable ? 'yes' : 'no'}`,
    `Eligibility request: ${diagnostics.eligibilityRequest}`,
    `Eligibility error: ${diagnostics.eligibilityError ?? 'none'}`,
  ];
  const products = [...diagnostics.products].sort((left, right) => (
    left.planId === right.planId ? 0 : left.planId === 'monthly' ? -1 : 1
  ));
  for (const product of products) {
    lines.push(
      '',
      `${product.planId === 'monthly' ? 'Monthly' : 'Annual'} product`,
      `Package ID: ${product.packageIdentifier}`,
      `Product ID: ${product.productIdentifier}`,
      `Eligibility: ${product.eligibility}`,
      `Numeric price: ${value(product.numericPrice)}`,
      `Currency code: ${value(product.currencyCode)}`,
      `Price string: ${value(product.priceString)}`,
      `Price per month: ${value(product.pricePerMonthString)}`,
      `Price per year: ${value(product.pricePerYearString)}`,
    );
  }
  if (products.length === 0) lines.push('', 'No RevenueCat products were returned.');
  return lines.join('\n');
}

function safePart(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const sanitized = String(value)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '[redacted-id]')
    .replace(/\b(?:eyJ|appl_|goog_|test_)[A-Za-z0-9._-]{12,}\b/g, '[redacted-value]')
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, '[redacted-value]')
    .trim();
  return sanitized ? sanitized.slice(0, 240) : null;
}

export function safeEligibilityError(error: unknown): string {
  if (!error || typeof error !== 'object') return safePart(error) ?? 'Unknown eligibility error';
  const record = error as Record<string, unknown>;
  const parts = [
    safePart(record.name),
    safePart(record.code),
    safePart(record.message),
  ].filter((part): part is string => Boolean(part));
  return parts.join(' · ') || 'Unknown eligibility error';
}
