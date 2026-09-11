import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ requireApplicationContext: vi.fn() }));
vi.mock('@/services/auth/actor', () => ({ requireApplicationContext: mocks.requireApplicationContext }));
import { requireTravelContext } from './context';

const context = (role = 'TRAVEL_AGENT', organisationId = 'org-a') => ({
  user: { id: 'user-a', name: 'Travel User', email: 'travel@example.com', role },
  organisation: { id: organisationId, name: 'Travel Org' }, property: null, properties: [], businessUnits: ['TRAVEL'],
});

describe('Travel context', () => {
  beforeEach(() => mocks.requireApplicationContext.mockReset());
  it('allows a Travel-only user without a Hotel property', async () => {
    mocks.requireApplicationContext.mockResolvedValue(context());
    await expect(requireTravelContext(new Request('http://local/api/travel'))).resolves.toMatchObject({ actor: { organisationId: 'org-a', role: 'TRAVEL_AGENT' }, organisation: { id: 'org-a' } });
  });
  it('uses the authenticated organisation and ignores caller tenant claims', async () => {
    mocks.requireApplicationContext.mockResolvedValue(context('TRAVEL_AGENT', 'org-authoritative'));
    const result = await requireTravelContext(new Request('http://local/api/travel?organisationId=org-foreign'));
    expect(result.organisation.id).toBe('org-authoritative');
  });
  it('rejects a role without Travel permission', async () => {
    mocks.requireApplicationContext.mockResolvedValue(context('RECEPTION'));
    await expect(requireTravelContext(new Request('http://local/api/travel'))).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });
});
