export type PurchaseChannel =
  | 'disabled'
  | 'test_store'
  | 'app_store_sandbox'
  | 'app_store_production';

export function purchaseChannel(value: string | undefined): PurchaseChannel {
  switch (value?.trim()) {
    case 'test_store':
    case 'app_store_sandbox':
    case 'app_store_production':
      return value.trim() as PurchaseChannel;
    default:
      return 'disabled';
  }
}

type PurchaseGateInput = {
  channel: PurchaseChannel;
  enabled: boolean;
  isDevelopmentBuild: boolean;
  platform: string;
  hasTestStoreKey: boolean;
  hasIosApiKey: boolean;
};

export function purchaseGate(input: PurchaseGateInput): boolean {
  if (!input.enabled) return false;
  if (input.channel === 'test_store') {
    return input.isDevelopmentBuild && input.hasTestStoreKey;
  }
  if (input.channel === 'app_store_sandbox' || input.channel === 'app_store_production') {
    return input.platform === 'ios' && input.hasIosApiKey;
  }
  return false;
}
