import { DomainError } from '@hotel/shared/domain';

export type AppMode = 'demo' | 'production';
export function appMode(): AppMode {
  const mode = process.env.APP_MODE;
  if (mode === 'demo' || mode === 'production') return mode;
  // Missing/invalid configuration must never enable demo access on a deployment.
  return !mode && process.env.NODE_ENV === 'development' ? 'demo' : 'production';
}
export function demoFeatureEnabled(flag: 'DEMO_ROLE_SWITCHER' | 'DEMO_NETWORK_SIMULATOR' | 'DEMO_INBOUND_BOOKINGS'): boolean {
  return appMode() === 'demo' && process.env[flag] !== 'false';
}
export function assertDemoMode(): void {
  if (appMode() !== 'demo') throw new DomainError('DEMO_DISABLED', 'Demo operations are unavailable in production mode.', 403);
}
