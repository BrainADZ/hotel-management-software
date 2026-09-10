export type TaxMode = 'CGST_SGST' | 'IGST' | 'EXEMPT';
export type ChargeCategory = 'ROOM_CHARGE' | 'EARLY_CHECKIN' | 'LATE_CHECKOUT' | 'EXTRA_BED' | 'LAUNDRY' | 'MINIBAR' | 'ROOM_SERVICE' | 'RESTAURANT' | 'DAMAGE' | 'OTHER_SERVICE' | 'DISCOUNT' | 'ADJUSTMENT';
export type MoneyLine = { subtotalPaise: number; discountPaise: number; taxableAmountPaise: number; taxPaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; totalPaise: number };
export type FolioTotals = MoneyLine & { grossChargesPaise: number; paymentsPaise: number; refundsPaise: number; outstandingPaise: number };
