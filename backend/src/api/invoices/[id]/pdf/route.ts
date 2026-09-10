import { and, eq, isNull } from 'drizzle-orm';
import { folioLines, invoices, paymentRefunds, payments, reservations, rooms } from '@/db/schema';
import { getDb } from '@/db';
import { apiError } from '@/services/api-response';
import { requireReservationContext } from '@/services/reservations/http';
import { assertRoleCan, DomainError } from '@hotel/shared/domain';
import { entityIdSchema } from '@/services/reservations/validation';
import { simpleFinancialPdf } from '@/modules/billing/documents';

export async function GET(request:Request,route:{params:Promise<{id:string}>}) {
  try {
    const c=await requireReservationContext(request); assertRoleCan(c.actor.role,'billing.view'); const db=getDb();
    const [i]=await db.select().from(invoices).where(and(eq(invoices.id,entityIdSchema.parse((await route.params).id)),eq(invoices.organisationId,c.actor.organisationId),eq(invoices.propertyId,c.property.id))).limit(1);
    if(!i)throw new DomainError('INVOICE_NOT_FOUND','Invoice was not found.',404);
    const [lineRows,paymentRows,refundRows,stayRows] = await Promise.all([
      db.select().from(folioLines).where(and(eq(folioLines.folioId,i.folioId),isNull(folioLines.voidedAt))),
      db.select().from(payments).where(eq(payments.folioId,i.folioId)),
      db.select().from(paymentRefunds).where(eq(paymentRefunds.folioId,i.folioId)),
      db.select({reference:reservations.reference,arrivalDate:reservations.arrivalDate,departureDate:reservations.departureDate,roomNumber:rooms.number}).from(reservations).leftJoin(rooms,eq(rooms.id,reservations.roomId)).where(eq(reservations.id,i.reservationId)).limit(1),
    ]);
    const stay=stayRows[0];
    const paid=paymentRows.reduce((sum,p)=>sum+(p.status==='REVERSED'?0:p.amountPaise),0)-refundRows.reduce((sum,r)=>sum+(r.status==='RECORDED'?r.amountPaise:0),0);
    const rows:Array<[string,string]>=[['Property',i.propertyLegalNameSnapshot],['Address',i.propertyAddressSnapshot??'Not configured'],['GSTIN',i.propertyGstinSnapshot??'Not configured'],['Invoice',i.invoiceNumber],['Date',i.invoiceDate],['Customer',i.customerNameSnapshot],['Company',i.customerCompanySnapshot??''],['Billing address',i.billingAddressSnapshot??''],['Customer GSTIN',i.customerGstinSnapshot??'Not supplied'],['Reservation',stay?.reference??i.reservationId],['Stay',`${stay?.arrivalDate??''} to ${stay?.departureDate??''}`],['Room',stay?.roomNumber??'TBA'],...lineRows.map(line=>[`Charge - ${line.description}`,`${line.lineTotalPaise} paise`] as [string,string]),['Subtotal',`${i.subtotalPaise} paise`],['Discount',`${i.discountPaise} paise`],['Taxable value',`${i.taxableAmountPaise} paise`],['CGST',`${i.cgstPaise} paise`],['SGST',`${i.sgstPaise} paise`],['IGST',`${i.igstPaise} paise`],['Grand total',`${i.grandTotalPaise} paise`],['Payments net of refunds',`${paid} paise`],['Balance',`${i.grandTotalPaise-paid} paise`]];
    const pdf=simpleFinancialPdf('GST Invoice',rows);
    return new Response(Buffer.from(pdf),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${i.invoiceNumber.replaceAll('/','-')}.pdf"`,'Cache-Control':'no-store, private'}});
  } catch(e){return apiError(e);}
}
