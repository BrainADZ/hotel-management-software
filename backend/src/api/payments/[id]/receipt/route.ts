import {
  and,
  eq,
} from "drizzle-orm";

import {
  appUsers,
  folios,
  paymentRefunds,
  payments,
  properties,
  reservations,
  rooms,
} from "@/db/schema";

import { getDb } from "@/db";
import {
  apiError,
} from "@/services/api-response";
import {
  requireReservationContext,
} from "@/services/reservations/http";
import {
  assertRoleCan,
  DomainError,
} from "@hotel/shared/domain";
import {
  entityIdSchema,
} from "@/services/reservations/validation";
import {
  premiumPaymentReceiptPdf,
} from "@/modules/billing/documents";

function formatDateTime(
  value: string | null | undefined,
) {
  if (!value) return "-";

  const date = new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return String(value);
  }

  return new Intl.DateTimeFormat(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    },
  ).format(date);
}

function humanize(
  value: string | null | undefined,
) {
  return String(value ?? "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );
}

export async function GET(
  request: Request,
  route: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  try {
    const context =
      await requireReservationContext(
        request,
      );

    assertRoleCan(
      context.actor.role,
      "billing.view",
    );

    const { id } =
      await route.params;

    const paymentId =
      entityIdSchema.parse(id);

    const db = getDb();

    const [payment] =
      await db
        .select({
          id:
            payments.id,

          paymentNumber:
            payments.paymentNumber,

          method:
            payments.method,

          amountPaise:
            payments.amountPaise,

          reference:
            payments.reference,

          notes:
            payments.notes,

          status:
            payments.status,

          receivedAt:
            payments.receivedAt,

          receivedBy:
            payments.receivedBy,

          reversedAt:
            payments.reversedAt,

          reversalReason:
            payments.reversalReason,

          propertyName:
            properties.name,

          propertyLegalName:
            properties.legalName,

          propertyAddress:
            properties.billingAddress,

          propertyGstin:
            properties.gstin,

          folioNumber:
            folios.folioNumber,

          reservationReference:
            reservations.reference,

          guestName:
            reservations.primaryGuestName,

          roomNumber:
            rooms.number,
        })
        .from(payments)
        .innerJoin(
          properties,
          eq(
            properties.id,
            payments.propertyId,
          ),
        )
        .innerJoin(
          folios,
          eq(
            folios.id,
            payments.folioId,
          ),
        )
        .innerJoin(
          reservations,
          eq(
            reservations.id,
            payments.reservationId,
          ),
        )
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
              payments.id,
              paymentId,
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
        )
        .limit(1);

    if (!payment) {
      throw new DomainError(
        "PAYMENT_NOT_FOUND",
        "Payment was not found.",
        404,
      );
    }

    const [
      refunds,
      receiverRows,
    ] = await Promise.all([
      db
        .select({
          amountPaise:
            paymentRefunds.amountPaise,

          status:
            paymentRefunds.status,
        })
        .from(paymentRefunds)
        .where(
          and(
            eq(
              paymentRefunds.paymentId,
              payment.id,
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
          name:
            appUsers.name,

          displayName:
            appUsers.displayName,

          role:
            appUsers.role,
        })
        .from(appUsers)
        .where(
          and(
            eq(
              appUsers.id,
              payment.receivedBy,
            ),

            eq(
              appUsers.organisationId,
              context.actor.organisationId,
            ),
          ),
        )
        .limit(1),
    ]);

    const receiver =
      receiverRows[0];

    const refundedPaise =
      refunds.reduce(
        (sum, refund) =>
          sum +
          (
            String(
              refund.status,
            ).toUpperCase() ===
            "RECORDED"
              ? Number(
                  refund.amountPaise,
                )
              : 0
          ),
        0,
      );

    const receivedPaise =
      Number(
        payment.amountPaise,
      );

    const netPaise =
      String(
        payment.status,
      ).toUpperCase() ===
      "REVERSED"
        ? 0
        : Math.max(
            0,
            receivedPaise -
              refundedPaise,
          );

    const managerName =
      receiver?.displayName?.trim() ||
      receiver?.name?.trim() ||
      "Authorized Manager";

    const managerTitle =
      humanize(
        receiver?.role,
      ) || "Manager";

    const pdf =
      premiumPaymentReceiptPdf({
        property: {
          name:
            payment.propertyLegalName?.trim() ||
            payment.propertyName,

          address:
            payment.propertyAddress,

          gstin:
            payment.propertyGstin,
        },

        receipt: {
          number:
            payment.paymentNumber,

          status:
            String(
              payment.status,
            ),

          receivedAt:
            formatDateTime(
              payment.receivedAt,
            ),

          method:
            String(
              payment.method,
            )
              .replaceAll(
                "_",
                " ",
              ),

          reference:
            payment.reference,

          notes:
            payment.notes,

          receivedBy:
            managerName,
        },

        guest: {
          name:
            payment.guestName,

          reservation:
            payment.reservationReference,

          folio:
            payment.folioNumber,

          room:
            payment.roomNumber,
        },

        manager: {
          name:
            managerName,

          title:
            managerTitle,
        },

        amounts: {
          receivedPaise,
          refundedPaise,
          netPaise,
        },

        reversal:
          String(
            payment.status,
          ).toUpperCase() ===
          "REVERSED"
            ? {
                reversedAt:
                  formatDateTime(
                    payment.reversedAt,
                  ),

                reason:
                  payment.reversalReason,
              }
            : null,
      });

    const filename =
      `Receipt-${payment.paymentNumber.replaceAll(
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
