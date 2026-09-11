import { describe, expect, it } from 'vitest';
import { assertSafeOfflinePayload, offlineSyncCommand, syncBatchSchema } from './validation';

const valid = { clientMutationId: '00000000-0000-4000-8000-000000000001', propertyId: 'property-a', command: 'RECORD_HOUSEKEEPING_OUTCOME', entityType: 'HOUSEKEEPING_TASK', entityId: 'task-a', payload: { outcome: 'CLEAN' } };

describe('production offline sync validation', () => {
  it.each(['SYNC_OFFLINE_RESERVATION', 'RECORD_HOUSEKEEPING_OUTCOME'])('allows %s', command => expect(offlineSyncCommand.parse(command)).toBe(command));
  it.each(['CAPTURE_PAYMENT', 'REFUND_PAYMENT', 'UPLOAD_KYC', 'CREATE_USER', 'DELETE_RESERVATION'])('blocks unsafe command %s', command => expect(offlineSyncCommand.safeParse(command).success).toBe(false));
  it('accepts a valid bounded batch', () => expect(syncBatchSchema.parse({ mutations: [valid] }).mutations).toHaveLength(1));
  it('rejects empty batches', () => expect(() => syncBatchSchema.parse({ mutations: [] })).toThrow());
  it('rejects more than fifty items', () => expect(() => syncBatchSchema.parse({ mutations: Array.from({ length: 51 }, () => valid) })).toThrow());
  it('rejects invalid stable mutation IDs', () => expect(() => syncBatchSchema.parse({ mutations: [{ ...valid, clientMutationId: 'temporary' }] })).toThrow());
  it('rejects spoofed top-level tenant and role fields', () => expect(() => syncBatchSchema.parse({ mutations: [{ ...valid, organisationId: 'foreign', role: 'OWNER' }] })).toThrow());
  it.each(['password', 'accessToken', 'refreshToken', 'cookie', 'apiKey', 'passportNumber', 'aadhaarNumber'])('rejects sensitive field %s recursively', field => expect(() => assertSafeOfflinePayload({ nested: { [field]: 'secret' } })).toThrow(/Sensitive field/));
  it('accepts operational data without identity secrets', () => expect(() => assertSafeOfflinePayload({ outcome: 'CLEAN', notes: 'Linen replaced', version: 2 })).not.toThrow());
});
