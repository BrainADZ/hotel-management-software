import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { roleCan, type AppRole } from '@hotel/shared/domain';
import { calculateFolio, calculateLine, financialYear, roomChargeDates } from './calculations';
import { checkoutSchema, discountSchema, manualChargeSchema, paymentSchema, refundSchema } from './validation';
import { simpleFinancialPdf } from './documents';

describe('Step 4 deterministic financial calculations', () => {
  it('counts and identifies each room night', () => expect(roomChargeDates('2026-09-10','2026-09-12')).toEqual(['2026-09-10','2026-09-11']));
  it('rejects invalid and zero-night stays', () => expect(() => roomChargeDates('2026-09-10','2026-09-10')).toThrow());
  it('calculates room charges in integer paise', () => expect(calculateLine(2,400000,0,1800,'CGST_SGST')).toEqual({subtotalPaise:800000,discountPaise:0,taxableAmountPaise:800000,taxPaise:144000,cgstPaise:72000,sgstPaise:72000,igstPaise:0,totalPaise:944000}));
  it('supports IGST without inventing a rate', () => expect(calculateLine(1,10000,0,500,'IGST')).toMatchObject({taxPaise:500,cgstPaise:0,sgstPaise:0,igstPaise:500}));
  it('supports exempt configured treatment', () => expect(calculateLine(1,10000,0,1800,'EXEMPT').taxPaise).toBe(0));
  it('rounds tax deterministically to a paise', () => expect(calculateLine(1,101,0,500,'IGST').taxPaise).toBe(5));
  it('rejects negative arbitrary charges', () => expect(() => calculateLine(1,-1,0,0,'EXEMPT')).toThrow());
  it('calculates advance and partial payment outstanding', () => expect(calculateFolio([calculateLine(1,2000000,0,0,'EXEMPT')],[500000],[],[]).outstandingPaise).toBe(1500000));
  it('sums split payments independently', () => expect(calculateFolio([calculateLine(1,2000000,0,0,'EXEMPT')],[500000,800000,700000],[],[]).outstandingPaise).toBe(0));
  it('adds refunds back to outstanding', () => expect(calculateFolio([calculateLine(1,100000,0,0,'EXEMPT')],[100000],[],[25000]).outstandingPaise).toBe(25000));
  it('removes reversed money from settlement', () => expect(calculateFolio([calculateLine(1,100000,0,0,'EXEMPT')],[100000],[100000],[]).outstandingPaise).toBe(100000));
  it.each([['2026-03-31','2025-26'],['2026-04-01','2026-27'],['2027-03-31','2026-27']] as const)('derives Indian financial year for %s', (date,fy) => expect(financialYear(new Date(`${date}T00:00:00Z`))).toBe(fy));
});
describe('Step 4 validation and permissions', () => {
  it.each([['OWNER','billing.override_checkout',true],['MANAGER','billing.discount',true],['ACCOUNTS','billing.refund',true],['RECEPTION','billing.take_payment',true],['RECEPTION','billing.discount',false],['REPORTING','billing.view',true],['REPORTING','billing.take_payment',false],['HOUSEKEEPING','billing.view',false],['RESTAURANT','billing.view',false]] as const)('%s / %s => %s',(role,permission,allowed)=>expect(roleCan(role as AppRole,permission)).toBe(allowed));
  it('accepts every supported payment method',()=>{for(const method of ['CASH','CARD','UPI','BANK_TRANSFER','OTHER'])expect(paymentSchema.parse({method,amountPaise:100,idempotencyKey:'operation-1'}).method).toBe(method);});
  it('rejects zero and negative payments',()=>{expect(()=>paymentSchema.parse({method:'CASH',amountPaise:0,idempotencyKey:'operation-1'})).toThrow();expect(()=>paymentSchema.parse({method:'CASH',amountPaise:-1,idempotencyKey:'operation-1'})).toThrow();});
  it('rejects sensitive card fields rather than persisting them',()=>expect(()=>paymentSchema.parse({method:'CARD',amountPaise:100,idempotencyKey:'operation-1',cardNumber:'4111111111111111',cvv:'123'})).toThrow());
  it('validates manual charge categories and positive paise',()=>expect(manualChargeSchema.parse({category:'LAUNDRY',description:'Laundry',quantity:2,unitAmountPaise:5000,idempotencyKey:'charge-001'}).quantity).toBe(2));
  it('requires discount authorization metadata',()=>expect(()=>discountSchema.parse({kind:'FIXED',amountPaise:5000,reason:'',idempotencyKey:'discount-001'})).toThrow());
  it('validates partial refund records',()=>expect(refundSchema.parse({amountPaise:1000,reason:'Guest request',idempotencyKey:'refund-001'}).amountPaise).toBe(1000));
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
  it('creates a valid printable PDF path',()=>{const pdf=simpleFinancialPdf('Receipt',[['Amount','10000 paise']]);expect(new TextDecoder().decode(pdf.slice(0,8))).toContain('%PDF-1.4');expect(pdf.length).toBeGreaterThan(300);});
});
