export const HOTEL_GST_CURRENT_EFFECTIVE_DATE = '2025-09-22';
export const HOTEL_GST_THRESHOLD_PAISE = 750_000;

export type RestaurantGstProfile =
  | 'UNCONFIGURED'
  | 'STANDARD_5_NO_ITC'
  | 'SPECIFIED_18_WITH_ITC';

function assertWholePaise(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative whole-paise value.`);
  }
}

function assertIsoDate(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must be an ISO date (YYYY-MM-DD).`);
  }
}

/**
 * Current India hotel-accommodation GST policy used for newly posted room nights.
 *
 * From 22 Sep 2025, accommodation valued up to and including INR 7,500 per
 * unit/day is 5% without ITC; above INR 7,500 is 18%.
 *
 * For service dates before that effective date we deliberately keep the
 * reservation's stored tax snapshot instead of retroactively re-rating old
 * stays. Historical corrections should use the accounting/reversal workflow.
 */
export function hotelAccommodationGstRateBps(
  valueOfSupplyPaise: number,
  serviceDate: string,
  historicalFallbackRateBps = 0,
) {
  assertWholePaise(valueOfSupplyPaise, 'Accommodation value');
  assertWholePaise(historicalFallbackRateBps, 'Historical GST rate');
  assertIsoDate(serviceDate, 'Service date');

  if (serviceDate < HOTEL_GST_CURRENT_EFFECTIVE_DATE) {
    return historicalFallbackRateBps;
  }

  return valueOfSupplyPaise <= HOTEL_GST_THRESHOLD_PAISE ? 500 : 1800;
}

/**
 * Estimate a room-only stay total using the same per-night tax rule that the
 * folio posting path uses. Tax is rounded per room night, matching line-level
 * accounting.
 */
export function hotelAccommodationStayEstimatePaise(
  nightlyRatePaise: number,
  arrivalDate: string,
  departureDate: string,
  historicalFallbackRateBps = 0,
) {
  assertWholePaise(nightlyRatePaise, 'Nightly rate');
  assertIsoDate(arrivalDate, 'Arrival date');
  assertIsoDate(departureDate, 'Departure date');

  const arrival = new Date(`${arrivalDate}T00:00:00Z`);
  const departure = new Date(`${departureDate}T00:00:00Z`);

  if (departure <= arrival) {
    throw new Error('Departure date must be after arrival date.');
  }

  let totalPaise = 0;

  for (
    let cursor = new Date(arrival);
    cursor < departure;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const serviceDate = cursor.toISOString().slice(0, 10);
    const taxRateBps = hotelAccommodationGstRateBps(
      nightlyRatePaise,
      serviceDate,
      historicalFallbackRateBps,
    );
    const taxPaise = Math.round((nightlyRatePaise * taxRateBps) / 10_000);
    totalPaise += nightlyRatePaise + taxPaise;
  }

  return totalPaise;
}

/**
 * Restaurant POS is a restaurant-service workflow, not a retail-goods engine.
 * Food, freshly prepared beverages and soft drinks supplied through this POS
 * therefore use the restaurant-service rate. Sealed standalone retail/minibar
 * sales should use a separate goods/HSN workflow instead of name-based guesses.
 *
 * Legacy UNCONFIGURED properties now safely default to the normal 5% restaurant
 * service treatment so staff are not forced to configure tax per item/order.
 */
export function restaurantServiceGstRateBps(
  profile: RestaurantGstProfile | null | undefined,
) {
  return profile === 'SPECIFIED_18_WITH_ITC' ? 1800 : 500;
}

export function normalizeRestaurantGstProfile(
  profile: RestaurantGstProfile | null | undefined,
): Exclude<RestaurantGstProfile, 'UNCONFIGURED'> {
  return profile === 'SPECIFIED_18_WITH_ITC'
    ? 'SPECIFIED_18_WITH_ITC'
    : 'STANDARD_5_NO_ITC';
}
