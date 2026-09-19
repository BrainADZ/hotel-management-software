import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { roleCan, type AppRole } from '@hotel/shared/domain';
import { calculateFolio, calculateLine, financialYear, roomChargeDates } from './calculations';
import { checkoutSchema, discountSchema, manualChargeSchema, paymentSchema, refundSchema } from './validation';
import { simpleFinancialPdf } from './documents';

describe('Step 4 deterministic financial calculations', () => {
  it('counts and identifies each room night', () => expect(roomChargeDates('2026-09-10','2026-09-12')).toEqual(['2026-09-10','2026-09-11']));
  it('rejects invalid and zero-night stays', () => expect(() => roomChargeDates('2026-09-10','2026-09-10')).toThrow());
  it('calculates room charges in rupees', () => expect(calculateLine(2,4000,0,1800,'CGST_SGST')).toEqual({subtotalRupees:8000,discountRupees:0,taxableAmountRupees:8000,taxRupees:1440,cgstRupees:720,sgstRupees:720,igstRupees:0,totalRupees:9440}));
  it('supports IGST without inventing a rate', () => expect(calculateLine(1,100,0,500,'IGST')).toMatchObject({taxRupees:5,cgstRupees:0,sgstRupees:0,igstRupees:5}));
  it('supports exempt configured treatment', () => expect(calculateLine(1,100,0,1800,'EXEMPT').taxRupees).toBe(0));
  it('rounds tax deterministically to paise precision', () => expect(calculateLine(1,1.01,0,500,'IGST').taxRupees).toBe(0.05));
  it('rejects negative arbitrary charges', () => expect(() => calculateLine(1,-0.01,0,0,'EXEMPT')).toThrow());
  it('calculates advance and partial payment outstanding', () => expect(calculateFolio([calculateLine(1,20000,0,0,'EXEMPT')],[5000],[],[]).outstandingRupees).toBe(15000));
  it('sums split payments independently', () => expect(calculateFolio([calculateLine(1,20000,0,0,'EXEMPT')],[5000,8000,7000],[],[]).outstandingRupees).toBe(0));
  it('adds refunds back to outstanding', () => expect(calculateFolio([calculateLine(1,1000,0,0,'EXEMPT')],[1000],[],[250]).outstandingRupees).toBe(250));
  it('removes reversed money from settlement', () => expect(calculateFolio([calculateLine(1,1000,0,0,'EXEMPT')],[1000],[1000],[]).outstandingRupees).toBe(1000));
  it.each([['2026-03-31','2025-26'],['2026-04-01','2026-27'],['2027-03-31','2026-27']] as const)('derives Indian financial year for %s', (date,fy) => expect(financialYear(new Date(`${date}T00:00:00Z`))).toBe(fy));
});
describe('Step 4 validation and permissions', () => {
  it.each([['OWNER','billing.override_checkout',true],['MANAGER','billing.discount',true],['ACCOUNTS','billing.refund',true],['RECEPTION','billing.take_payment',true],['RECEPTION','billing.discount',false],['REPORTING','billing.view',true],['REPORTING','billing.take_payment',false],['HOUSEKEEPING','billing.view',false],['RESTAURANT','billing.view',false]] as const)('%s / %s => %s',(role,permission,allowed)=>expect(roleCan(role as AppRole,permission)).toBe(allowed));
  it('accepts every supported payment method',()=>{for(const method of ['CASH','CARD','UPI','BANK_TRANSFER','OTHER'])expect(paymentSchema.parse({method,amountRupees:1,idempotencyKey:'operation-1'}).method).toBe(method);});
  it('rejects zero and negative payments',()=>{expect(()=>paymentSchema.parse({method:'CASH',amountRupees:0,idempotencyKey:'operation-1'})).toThrow();expect(()=>paymentSchema.parse({method:'CASH',amountRupees:-0.01,idempotencyKey:'operation-1'})).toThrow();});
  it('rejects sensitive card fields rather than persisting them',()=>expect(()=>paymentSchema.parse({method:'CARD',amountRupees:1,idempotencyKey:'operation-1',cardNumber:'4111111111111111',cvv:'123'})).toThrow());
  it('validates manual charge categories and positive rupees',()=>expect(manualChargeSchema.parse({category:'LAUNDRY',description:'Laundry',quantity:2,unitAmountRupees:50,idempotencyKey:'charge-001'}).quantity).toBe(2));
  it('requires discount authorization metadata',()=>expect(()=>discountSchema.parse({kind:'FIXED',amountRupees:50,reason:'',idempotencyKey:'discount-001'})).toThrow());
  it('validates partial refund records',()=>expect(refundSchema.parse({amountRupees:10,reason:'Guest request',idempotencyKey:'refund-001'}).amountRupees).toBe(10));
  it('requires an unpaid-checkout reason',()=>expect(()=>checkoutSchema.parse({allowOutstanding:true})).toThrow());
  it('accepts an authorized override shape with reason',()=>expect(checkoutSchema.parse({allowOutstanding:true,overrideReason:'Approved company credit'}).allowOutstanding).toBe(true));
});
describe('Step 4 persistence and documents',()=>{
  const migration=readFileSync('drizzle-postgres/0003_billing_payments_gst.sql','utf8');
  it('preserves one primary folio per reservation',()=>expect(migration).not.toContain('DROP INDEX "idx_folios_reservation"'));
  it('uses database idempotency for payments and room nights',()=>{expect(migration).toContain('idx_payments_folio_idempotency');expect(migration).toContain('idx_room_charge_source');});
  it('uses property and financial-year sequences',()=>expect(migration).toContain('financial_sequences'));
  it('prevents duplicate issued invoices',()=>expect(migration).toContain('idx_invoices_folio_issued'));
  it('stores immutable invoice snapshots',()=>{expect(migration).toContain('customer_name_snapshot');expect(migration).toContain('property_legal_name_snapshot');});
  it('creates a valid printable PDF path',()=>{const pdf=simpleFinancialPdf('Receipt',[['Amount','10000 rupees']]);expect(new TextDecoder().decode(pdf.slice(0,8))).toContain('%PDF-1.4');expect(pdf.length).toBeGreaterThan(300);});
});
