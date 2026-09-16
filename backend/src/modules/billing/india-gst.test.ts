import { describe, expect, it } from 'vitest';

import {
  hotelAccommodationGstRateBps,
  hotelAccommodationStayEstimatePaise,
  normalizeRestaurantGstProfile,
  restaurantServiceGstRateBps,
} from './india-gst';

describe('India GST policy', () => {
  it('uses 5% for current hotel accommodation up to and including INR 7,500 per unit/day', () => {
    expect(hotelAccommodationGstRateBps(450_000, '2026-09-16')).toBe(500);
    expect(hotelAccommodationGstRateBps(750_000, '2026-09-16')).toBe(500);
  });

  it('uses 18% for current hotel accommodation above INR 7,500 per unit/day', () => {
    expect(hotelAccommodationGstRateBps(750_001, '2026-09-16')).toBe(1800);
    expect(hotelAccommodationGstRateBps(900_000, '2026-09-16')).toBe(1800);
  });

  it('preserves the stored tax snapshot for pre-22-Sep-2025 room nights', () => {
    expect(hotelAccommodationGstRateBps(450_000, '2025-09-21', 1200)).toBe(1200);
  });

  it('estimates stay totals per night using the accommodation rule', () => {
    expect(
      hotelAccommodationStayEstimatePaise(
        600_000,
        '2026-09-16',
        '2026-09-18',
      ),
    ).toBe(1_260_000);
  });

  it('defaults normal and legacy-unconfigured restaurant service to 5%', () => {
    expect(restaurantServiceGstRateBps('STANDARD_5_NO_ITC')).toBe(500);
    expect(restaurantServiceGstRateBps('UNCONFIGURED')).toBe(500);
    expect(restaurantServiceGstRateBps(undefined)).toBe(500);
  });

  it('keeps the explicit specified-premises restaurant treatment at 18%', () => {
    expect(restaurantServiceGstRateBps('SPECIFIED_18_WITH_ITC')).toBe(1800);
  });

  it('normalizes legacy unconfigured restaurant profiles to the standard 5% profile', () => {
    expect(normalizeRestaurantGstProfile('UNCONFIGURED')).toBe(
      'STANDARD_5_NO_ITC',
    );
  });
});
