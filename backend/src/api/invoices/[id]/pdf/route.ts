import { and, asc, eq, isNull } from "drizzle-orm";

import {
  folioLines,
  invoices,
  paymentRefunds,
  payments,
  reservations,
  rooms,
} from "@/db/schema";

import { getDb } from "@/db";
import { apiError } from "@/services/api-response";
import { requireReservationContext } from "@/services/reservations/http";
import {
  assertRoleCan,
  DomainError,
} from "@hotel/shared/domain";
import { entityIdSchema } from "@/services/reservations/validation";
import { premiumInvoicePdf } from "@/modules/billing/documents";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatDate(value: string | null | undefined) {
  if (!value) return "-";

  const clean = String(value).slice(0, 10);
  const [year, month, day] = clean.split("-");
  const monthIndex = Number(month) - 1;

  if (
    !year ||
    !month ||
    !day ||
    monthIndex < 0 ||
    monthIndex > 11
  ) {
    return clean;
  }

  return `${Number(day)} ${MONTHS[monthIndex]} ${year}`;
}

export async function GET(
  request: Request,
  route: {
    params: Promise<{ id: string }>;
  },
) {
  try {
    const context =
      await requireReservationContext(request);

    assertRoleCan(
      context.actor.role,
      "billing.view",
    );

    const db = getDb();

    const { id } = await route.params;

    const invoiceId =
      entityIdSchema.parse(id);

    const [invoice] = await db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.id, invoiceId),
          eq(
            invoices.organisationId,
            context.actor.organisationId,
          ),
          eq(
            invoices.propertyId,
            context.property.id,
          ),
        ),
      )
      .limit(1);

    if (!invoice) {
      throw new DomainError(
        "INVOICE_NOT_FOUND",
        "Invoice was not found.",
        404,
      );
    }

    const [
      lineRows,
      paymentRows,
      refundRows,
      stayRows,
    ] = await Promise.all([
      db
        .select()
        .from(folioLines)
        .where(
          and(
            eq(
              folioLines.folioId,
              invoice.folioId,
            ),
            eq(
              folioLines.organisationId,
              context.actor.organisationId,
            ),
            eq(
              folioLines.propertyId,
              context.property.id,
            ),
            isNull(folioLines.voidedAt),
          ),
        )
        .orderBy(
          asc(folioLines.createdAt),
        ),

      db
        .select()
        .from(payments)
        .where(
          and(
            eq(
              payments.folioId,
              invoice.folioId,
            ),
            eq(
              payments.organisationId,
              context.actor.organisationId,
            ),
            eq(
              payments.propertyId,
              context.property.id,
            ),
          ),
        ),

      db
        .select()
        .from(paymentRefunds)
        .where(
          and(
            eq(
              paymentRefunds.folioId,
              invoice.folioId,
            ),
            eq(
              paymentRefunds.organisationId,
              context.actor.organisationId,
            ),
            eq(
              paymentRefunds.propertyId,
              context.property.id,
            ),
          ),
        ),

      db
        .select({
          reference:
            reservations.reference,
          arrivalDate:
            reservations.arrivalDate,
          departureDate:
            reservations.departureDate,
          roomNumber:
            rooms.number,
        })
        .from(reservations)
        .leftJoin(
          rooms,
          eq(
            rooms.id,
            reservations.roomId,
          ),
        )
        .where(
          and(
            eq(
              reservations.id,
              invoice.reservationId,
            ),
            eq(
              reservations.organisationId,
              context.actor.organisationId,
            ),
            eq(
              reservations.propertyId,
              context.property.id,
            ),
          ),
        )
        .limit(1),
    ]);

    const stay = stayRows[0];

    const receivedAmount =
      paymentRows.reduce(
        (sum, payment) =>
          sum +
          (payment.status === "REVERSED"
            ? 0
            : Number(
                payment.amountPaise,
              )),
        0,
      );

    const refundedAmount =
      refundRows.reduce(
        (sum, refund) =>
          sum +
          (refund.status === "RECORDED"
            ? Number(
                refund.amountPaise,
              )
            : 0),
        0,
      );

    const paid =
      receivedAmount - refundedAmount;

    const grandTotal =
      Number(
        invoice.grandTotalPaise,
      );

    const balance =
      grandTotal - paid;

    const pdf =
      premiumInvoicePdf({
        property: {
          name:
            invoice.propertyLegalNameSnapshot,

          address:
            invoice.propertyAddressSnapshot,

          gstin:
            invoice.propertyGstinSnapshot,
        },

        invoice: {
          number:
            invoice.invoiceNumber,

          date:
            formatDate(
              invoice.invoiceDate,
            ),

          status:
            String(
              invoice.status ??
                "ISSUED",
            ),
        },

        customer: {
          name:
            invoice.customerNameSnapshot,

          company:
            invoice.customerCompanySnapshot,

          billingAddress:
            invoice.billingAddressSnapshot,

          gstin:
            invoice.customerGstinSnapshot,
        },

        stay: {
          reservation:
            stay?.reference ??
            invoice.reservationId,

          dates:
            stay?.arrivalDate &&
            stay?.departureDate
              ? `${formatDate(
                  stay.arrivalDate,
                )} - ${formatDate(
                  stay.departureDate,
                )}`
              : "Stay details unavailable",

          room:
            stay?.roomNumber ??
            "TBA",
        },

        lines:
          lineRows.map(
            (line) => ({
              description:
                line.description,

              quantity:
                Number(
                  line.quantity ??
                    1,
                ),

              unitAmountPaise:
                Number(
                  line.unitAmountPaise ??
                    0,
                ),

              amountPaise:
                Number(
                  line.lineTotalPaise ??
                    0,
                ),
            }),
          ),

        totals: {
          subtotalPaise:
            Number(
              invoice.subtotalPaise,
            ),

          discountPaise:
            Number(
              invoice.discountPaise,
            ),

          taxableAmountPaise:
            Number(
              invoice.taxableAmountPaise,
            ),

          cgstPaise:
            Number(
              invoice.cgstPaise,
            ),

          sgstPaise:
            Number(
              invoice.sgstPaise,
            ),

          igstPaise:
            Number(
              invoice.igstPaise,
            ),

          grandTotalPaise:
            grandTotal,

          paidPaise:
            paid,

          balancePaise:
            balance,
        },
      });

    const filename =
      `Invoice-${invoice.invoiceNumber.replaceAll(
        "/",
        "-",
      )}.pdf`;

    return new Response(
      Buffer.from(pdf),
      {
        headers: {
          "Content-Type":
            "application/pdf",

          "Content-Disposition":
            `attachment; filename="${filename}"`,

          "Cache-Control":
            "no-store, private",
        },
      },
    );
  } catch (error) {
    return apiError(error);
  }
}