import { z } from 'zod';

export const offlineSyncCommand = z.enum(['SYNC_OFFLINE_RESERVATION', 'RECORD_HOUSEKEEPING_OUTCOME']);
const mutation = z.object({
  clientMutationId: z.string().uuid(), command: z.string().trim().min(1).max(80),
  entityType: z.enum(['RESERVATION', 'HOUSEKEEPING_TASK']), entityId: z.string().trim().min(1).max(120).nullish(),
  propertyId: z.string().trim().min(1).max(100), payload: z.record(z.string(), z.unknown()),
}).strict();
export const syncBatchSchema = z.object({ mutations: z.array(mutation).min(1).max(50) }).strict();
export type OfflineSyncMutationInput = z.infer<typeof mutation>;

const forbiddenKey = /^(authorization|cookie|password|accessToken|refreshToken|sessionToken|apiKey|secret|aadhaar|aadhar|aadhaarNumber|aadharNumber|passportNumber|passportNo|voterId|voterNumber|voterNo|drivingLicenseNumber|drivingLicenceNumber|drivingLicenseNo|drivingLicenceNo|documentNumber|kycNumber|fullKycNumber)$/i;
export function assertSafeOfflinePayload(value: unknown, path: string[] = []): void {
  if (Array.isArray(value)) return value.forEach((item, index) => assertSafeOfflinePayload(item, [...path, String(index)]));
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const location = [...path, key].join('.');
    if (forbiddenKey.test(key) || (location.toLowerCase().includes('kyc') && /number|value/i.test(key))) throw new Error(`Sensitive field is not allowed in offline sync: ${key}`);
    assertSafeOfflinePayload(nested, [...path, key]);
  }
}
