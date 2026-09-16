import { describe, expect, it } from 'vitest';
import { workflowSchemas } from './workflows';

const base = {
  clientOperationId: '11111111-1111-4111-8111-111111111111',
  items: [{ menuItemId: 'menu-1', quantity: 2 }],
  specialInstructions: 'Less spicy',
};

describe('restaurant dine-in order validation', () => {
  it('allows a walk-in dine-in order without a reservation', () => {
    const parsed = workflowSchemas.CREATE_RESTAURANT_ORDER.parse({
      ...base,
      orderType: 'RESTAURANT',
      tableNumber: 'T12',
      covers: 3,
      waiterUserId: 'waiter-1',
    });

    expect(parsed.reservationId).toBeUndefined();
    expect(parsed.tableNumber).toBe('T12');
    expect(parsed.covers).toBe(3);
    expect(parsed.waiterUserId).toBe('waiter-1');
  });

  it('allows dine-in to link to a checked-in guest when supplied', () => {
    const parsed = workflowSchemas.CREATE_RESTAURANT_ORDER.parse({
      ...base,
      orderType: 'RESTAURANT',
      reservationId: 'reservation-1',
      tableNumber: '7',
      covers: 2,
      waiterUserId: 'waiter-1',
    });

    expect(parsed.reservationId).toBe('reservation-1');
  });

  it('requires table, covers and waiter for dine-in', () => {
    const result = workflowSchemas.CREATE_RESTAURANT_ORDER.safeParse({
      ...base,
      orderType: 'RESTAURANT',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join('.'));
      expect(paths).toContain('tableNumber');
      expect(paths).toContain('covers');
      expect(paths).toContain('waiterUserId');
    }
  });

  it('requires a checked-in stay reference for room service', () => {
    const result = workflowSchemas.CREATE_RESTAURANT_ORDER.safeParse({
      ...base,
      orderType: 'ROOM_SERVICE',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === 'reservationId')).toBe(true);
    }
  });
});
