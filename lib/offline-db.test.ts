import { describe, expect, it } from 'vitest';
import { createOnlineFolioPdf, normalizeUiStyle } from './offline-db';

describe('interface style preference', () => {
  it('keeps the current Sage interface as the safe default', () => {
    expect(normalizeUiStyle(undefined)).toBe('sage');
    expect(normalizeUiStyle('unknown')).toBe('sage');
  });

  it('accepts the optional Classic Blue interface', () => {
    expect(normalizeUiStyle('classic-blue')).toBe('classic-blue');
  });
});

describe('folio PDF generation', () => {
  it('creates a downloadable PDF from authoritative folio totals', async () => {
    const result = createOnlineFolioPdf({
      bookingReference: 'BH-PDF-1001',
      guestName: 'PDF Test Guest',
      roomNumber: '204',
      arrivalDate: '2026-08-24',
      departureDate: '2026-08-26',
      folioStatus: 'OPEN',
      subtotalPaise: 935_000,
      taxPaise: 168_300,
      totalPaise: 1_103_300,
      lines: [{ description: 'Room charges', quantity: 1, unitAmountPaise: 935_000, taxRateBps: 1_800, lineTotalPaise: 935_000 }],
    });
    expect(result.filename).toBe('BrainADZ-Folio-BH-PDF-1001.pdf');
    expect(result.blob.type).toBe('application/pdf');
    const bytes = new Uint8Array(await result.blob.arrayBuffer());
    const contents = new TextDecoder().decode(bytes);
    expect(contents.slice(0, 4)).toBe('%PDF');
    expect(contents).toContain('2 nights');
  });
});
