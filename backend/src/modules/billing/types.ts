export type TaxMode = 'CGST_SGST' | 'IGST' | 'EXEMPT';
export type ChargeCategory = 'ROOM_CHARGE' | 'EARLY_CHECKIN' | 'LATE_CHECKOUT' | 'EXTRA_BED' | 'LAUNDRY' | 'MINIBAR' | 'ROOM_SERVICE' | 'RESTAURANT' | 'DAMAGE' | 'OTHER_SERVICE' | 'DISCOUNT' | 'ADJUSTMENT';
export type MoneyLine = { subtotalRupees: number; discountRupees: number; taxableAmountRupees: number; taxRupees: number; cgstRupees: number; sgstRupees: number; igstRupees: number; totalRupees: number };
export type FolioTotals = MoneyLine & { grossChargesRupees: number; paymentsRupees: number; refundsRupees: number; outstandingRupees: number };
