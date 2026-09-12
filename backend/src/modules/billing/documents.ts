const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;

type TextAlign = "left" | "right" | "center";

type InvoiceLine = {
  description: string;
  quantity: number;
  unitAmountPaise: number;
  amountPaise: number;
};

export type PremiumInvoicePdfInput = {
  property: {
    name: string;
    address?: string | null;
    gstin?: string | null;
  };

  invoice: {
    number: string;
    date: string;
    status?: string | null;
  };

  customer: {
    name: string;
    company?: string | null;
    billingAddress?: string | null;
    gstin?: string | null;
  };

  stay: {
    reservation: string;
    dates: string;
    room: string;
  };

  lines: InvoiceLine[];

  totals: {
    subtotalPaise: number;
    discountPaise: number;
    taxableAmountPaise: number;
    cgstPaise: number;
    sgstPaise: number;
    igstPaise: number;
    grandTotalPaise: number;
    paidPaise: number;
    balancePaise: number;
  };
};

type TextOptions = {
  bold?: boolean;
  color?: string;
  align?: TextAlign;
};

function escapePdf(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)")
    .replaceAll(/[^\x20-\x7e]/g, "?");
}

function estimateTextWidth(
  value: string,
  size: number,
  bold = false,
) {
  return value.length * size * (bold ? 0.56 : 0.52);
}

function pdfText(
  value: string,
  x: number,
  y: number,
  size = 10,
  options: TextOptions = {},
) {
  const {
    bold = false,
    color = "0.18 0.23 0.33",
    align = "left",
  } = options;

  let textX = x;

  if (align === "right") {
    textX =
      x - estimateTextWidth(value, size, bold);
  }

  if (align === "center") {
    textX =
      x -
      estimateTextWidth(value, size, bold) / 2;
  }

  return [
    "BT",
    `/${bold ? "F2" : "F1"} ${size} Tf`,
    `${color} rg`,
    `1 0 0 1 ${textX.toFixed(2)} ${y.toFixed(2)} Tm`,
    `(${escapePdf(value)}) Tj`,
    "ET",
  ].join(" ");
}

function pdfRect(
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
) {
  return `${fill} rg ${x} ${y} ${width} ${height} re f`;
}

function pdfLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color = "0.86 0.88 0.92",
  width = 1,
) {
  return `${color} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S`;
}

function wrapText(
  value: string,
  maxChars: number,
) {
  const clean =
    value.replace(/\s+/g, " ").trim();

  if (!clean) {
    return [""];
  }

  const words = clean.split(" ");

  const lines: string[] = [];

  let current = "";

  for (const word of words) {
    const candidate =
      current
        ? `${current} ${word}`
        : word;

    if (
      candidate.length > maxChars &&
      current
    ) {
      lines.push(current);

      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function truncateText(
  value: string,
  maxChars: number,
) {
  const clean =
    value.replace(/\s+/g, " ").trim();

  if (clean.length <= maxChars) {
    return clean;
  }

  return `${clean.slice(
    0,
    maxChars - 3,
  )}...`;
}

export function formatInrPaise(
  value: number,
) {
  const rupees =
    Number(value || 0) / 100;

  return `INR ${new Intl.NumberFormat(
    "en-IN",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  ).format(rupees)}`;
}

/* ============================================================
   HEADER
============================================================ */

function renderPageHeader(
  commands: string[],
  input: PremiumInvoicePdfInput,
  pageNumber: number,
  firstPage: boolean,
) {
  const navy =
    "0.055 0.09 0.16";

  const soft =
    "0.74 0.79 0.86";

  commands.push(
    pdfRect(
      0,
      760,
      PAGE_WIDTH,
      82,
      navy,
    ),
  );

  const propertyName =
    input.property.name || "Hotel";

  const initial =
    propertyName
      .trim()
      .charAt(0)
      .toUpperCase() || "H";

  commands.push(
    pdfRect(
      40,
      785,
      34,
      34,
      "1 1 1",
    ),
  );

  commands.push(
    pdfText(
      initial,
      57,
      796,
      16,
      {
        bold: true,
        color: navy,
        align: "center",
      },
    ),
  );

  commands.push(
    pdfText(
      truncateText(
        propertyName,
        34,
      ),
      88,
      807,
      17,
      {
        bold: true,
        color: "1 1 1",
      },
    ),
  );

  commands.push(
    pdfText(
      "HOTEL & HOSPITALITY",
      88,
      790,
      8,
      {
        bold: true,
        color: soft,
      },
    ),
  );

  commands.push(
    pdfText(
      firstPage
        ? "TAX INVOICE"
        : "TAX INVOICE - CONTINUED",
      555,
      809,
      10,
      {
        bold: true,
        color: "1 1 1",
        align: "right",
      },
    ),
  );

  commands.push(
    pdfText(
      input.invoice.number,
      555,
      790,
      11,
      {
        bold: true,
        color: "1 1 1",
        align: "right",
      },
    ),
  );

  if (!firstPage) {
    commands.push(
      pdfText(
        `Page ${pageNumber}`,
        555,
        773,
        7,
        {
          color: soft,
          align: "right",
        },
      ),
    );
  }
}

/* ============================================================
   PROPERTY / INVOICE
============================================================ */

function renderPropertyAndInvoiceInfo(
  commands: string[],
  input: PremiumInvoicePdfInput,
) {
  const navy =
    "0.055 0.09 0.16";

  const slate =
    "0.37 0.42 0.50";

  const muted =
    "0.55 0.60 0.67";

  const y = 731;

  commands.push(
    pdfText(
      "PROPERTY",
      40,
      y,
      7.5,
      {
        bold: true,
        color: muted,
      },
    ),
  );

  const address =
    wrapText(
      input.property.address ||
        "Address not configured",
      50,
    ).slice(0, 2);

  address.forEach(
    (line, index) => {
      commands.push(
        pdfText(
          line,
          40,
          y - 18 - index * 12,
          9,
          {
            color: slate,
          },
        ),
      );
    },
  );

  commands.push(
    pdfText(
      `GSTIN: ${
        input.property.gstin ||
        "Not configured"
      }`,
      40,
      y - 49,
      8.5,
      {
        color: slate,
      },
    ),
  );

  commands.push(
    pdfText(
      "INVOICE DETAILS",
      335,
      y,
      7.5,
      {
        bold: true,
        color: muted,
      },
    ),
  );

  commands.push(
    pdfText(
      "Invoice Date",
      335,
      y - 20,
      8.5,
      {
        color: muted,
      },
    ),
  );

  commands.push(
    pdfText(
      input.invoice.date,
      555,
      y - 20,
      9,
      {
        bold: true,
        color: navy,
        align: "right",
      },
    ),
  );

  commands.push(
    pdfText(
      "Status",
      335,
      y - 40,
      8.5,
      {
        color: muted,
      },
    ),
  );

  commands.push(
    pdfText(
      input.invoice.status ||
        "ISSUED",
      555,
      y - 40,
      9,
      {
        bold: true,
        color: navy,
        align: "right",
      },
    ),
  );
}

/* ============================================================
   CUSTOMER + STAY
============================================================ */

function renderGuestStayPanel(
  commands: string[],
  input: PremiumInvoicePdfInput,
) {
  const navy =
    "0.055 0.09 0.16";

  const slate =
    "0.37 0.42 0.50";

  const muted =
    "0.55 0.60 0.67";

  const background =
    "0.967 0.973 0.982";

  commands.push(
    pdfRect(
      40,
      588,
      515,
      92,
      background,
    ),
  );

  commands.push(
    pdfText(
      "BILL TO",
      54,
      659,
      7.5,
      {
        bold: true,
        color: muted,
      },
    ),
  );

  commands.push(
    pdfText(
      truncateText(
        input.customer.name ||
          "Guest",
        36,
      ),
      54,
      639,
      13,
      {
        bold: true,
        color: navy,
      },
    ),
  );

  const customerDetails = [
    input.customer.company,
    input.customer.billingAddress,
  ]
    .filter(Boolean)
    .join(" | ");

  const customerLines =
    wrapText(
      customerDetails ||
        "Direct guest",
      46,
    ).slice(0, 2);

  customerLines.forEach(
    (line, index) => {
      commands.push(
        pdfText(
          line,
          54,
          621 - index * 12,
          8.5,
          {
            color: slate,
          },
        ),
      );
    },
  );

  commands.push(
    pdfText(
      `GSTIN: ${
        input.customer.gstin ||
        "Not supplied"
      }`,
      54,
      596,
      8,
      {
        color: muted,
      },
    ),
  );

  commands.push(
    pdfText(
      "STAY DETAILS",
      335,
      659,
      7.5,
      {
        bold: true,
        color: muted,
      },
    ),
  );

  commands.push(
    pdfText(
      `Reservation: ${
        input.stay.reservation
      }`,
      335,
      639,
      8.5,
      {
        color: slate,
      },
    ),
  );

  commands.push(
    pdfText(
      `Stay: ${
        input.stay.dates
      }`,
      335,
      620,
      8.5,
      {
        color: slate,
      },
    ),
  );

  commands.push(
    pdfText(
      `Room: ${
        input.stay.room
      }`,
      335,
      601,
      8.5,
      {
        bold: true,
        color: navy,
      },
    ),
  );
}

/* ============================================================
   CHARGE TABLE
============================================================ */

function renderChargeTable(
  commands: string[],
  lines: InvoiceLine[],
  tableTop: number,
) {
  const navy =
    "0.055 0.09 0.16";

  const slate =
    "0.37 0.42 0.50";

  const border =
    "0.88 0.90 0.93";

  commands.push(
    pdfRect(
      40,
      tableTop,
      515,
      27,
      navy,
    ),
  );

  commands.push(
    pdfText(
      "DESCRIPTION",
      54,
      tableTop + 9,
      7.2,
      {
        bold: true,
        color: "1 1 1",
      },
    ),
  );

  commands.push(
    pdfText(
      "QTY",
      357,
      tableTop + 9,
      7.2,
      {
        bold: true,
        color: "1 1 1",
        align: "center",
      },
    ),
  );

  commands.push(
    pdfText(
      "RATE",
      454,
      tableTop + 9,
      7.2,
      {
        bold: true,
        color: "1 1 1",
        align: "right",
      },
    ),
  );

  commands.push(
    pdfText(
      "AMOUNT",
      541,
      tableTop + 9,
      7.2,
      {
        bold: true,
        color: "1 1 1",
        align: "right",
      },
    ),
  );

  let rowY =
    tableTop - 30;

  lines.forEach(
    (item) => {
      commands.push(
        pdfText(
          truncateText(
            item.description,
            45,
          ),
          54,
          rowY + 9,
          8.5,
          {
            color: navy,
          },
        ),
      );

      commands.push(
        pdfText(
          String(
            item.quantity,
          ),
          357,
          rowY + 9,
          8.5,
          {
            color: slate,
            align: "center",
          },
        ),
      );

      commands.push(
        pdfText(
          formatInrPaise(
            item.unitAmountPaise,
          ),
          454,
          rowY + 9,
          8.2,
          {
            color: slate,
            align: "right",
          },
        ),
      );

      commands.push(
        pdfText(
          formatInrPaise(
            item.amountPaise,
          ),
          541,
          rowY + 9,
          8.5,
          {
            bold: true,
            color: navy,
            align: "right",
          },
        ),
      );

      commands.push(
        pdfLine(
          40,
          rowY - 2,
          555,
          rowY - 2,
          border,
          0.6,
        ),
      );

      rowY -= 30;
    },
  );

  /*
   * IMPORTANT:
   * Return actual table end position.
   *
   * Summary will now start immediately
   * below the last charge row.
   */
  return {
    bottomY:
      rowY + 28,
  };
}

/* ============================================================
   DYNAMIC TOTALS + PAYMENT AREA
============================================================ */

function renderSummary(
  commands: string[],
  input: PremiumInvoicePdfInput,
  tableBottomY: number,
) {
  const navy =
    "0.055 0.09 0.16";

  const slate =
    "0.37 0.42 0.50";

  const muted =
    "0.55 0.60 0.67";

  const light =
    "0.967 0.973 0.982";

  const veryLight =
    "0.985 0.988 0.993";

  const border =
    "0.87 0.89 0.92";

  /*
   * THIS IS THE MAIN FIX.
   *
   * Earlier totals were stuck at y=276.
   * Now totals follow the actual table.
   */
  const top =
    Math.max(
      tableBottomY - 16,
      258,
    );

  const height = 166;

  const bottom =
    top - height;

  /* -----------------------
     LEFT PAYMENT CARD
  ------------------------ */

  commands.push(
    pdfRect(
      40,
      bottom,
      245,
      height,
      veryLight,
    ),
  );

  commands.push(
    pdfText(
      "PAYMENT",
      55,
      top - 20,
      7.5,
      {
        bold: true,
        color: muted,
      },
    ),
  );

  const isPaid =
    input.totals.balancePaise <= 0;

  commands.push(
    pdfRect(
      55,
      top - 50,
      isPaid ? 50 : 62,
      21,
      isPaid
        ? "0.10 0.47 0.30"
        : "0.72 0.32 0.12",
    ),
  );

  commands.push(
    pdfText(
      isPaid
        ? "PAID"
        : "PAYMENT DUE",
      isPaid
        ? 80
        : 86,
      top - 43,
      7,
      {
        bold: true,
        color: "1 1 1",
        align: "center",
      },
    ),
  );

  commands.push(
    pdfText(
      "Paid",
      55,
      top - 76,
      8.5,
      {
        color: muted,
      },
    ),
  );

  commands.push(
    pdfText(
      formatInrPaise(
        input.totals.paidPaise,
      ),
      270,
      top - 76,
      9,
      {
        bold: true,
        color: navy,
        align: "right",
      },
    ),
  );

  commands.push(
    pdfText(
      "Balance",
      55,
      top - 96,
      8.5,
      {
        color: muted,
      },
    ),
  );

  commands.push(
    pdfText(
      formatInrPaise(
        input.totals.balancePaise,
      ),
      270,
      top - 96,
      9,
      {
        bold: true,
        color: navy,
        align: "right",
      },
    ),
  );

  commands.push(
    pdfLine(
      55,
      top - 112,
      270,
      top - 112,
      border,
      0.6,
    ),
  );

  commands.push(
    pdfText(
      "Thank you for staying with us.",
      55,
      top - 132,
      8.5,
      {
        bold: true,
        color: navy,
      },
    ),
  );

  commands.push(
    pdfText(
      "Computer-generated tax invoice.",
      55,
      top - 150,
      7.5,
      {
        color: muted,
      },
    ),
  );

  /* -----------------------
     RIGHT TOTALS CARD
  ------------------------ */

  commands.push(
    pdfRect(
      310,
      bottom,
      245,
      height,
      light,
    ),
  );

  const discount =
    input.totals.discountPaise === 0
      ? 0
      : -Math.abs(
          input.totals.discountPaise,
        );

  const rows: Array<
    [string, number]
  > = [
    [
      "Subtotal",
      input.totals.subtotalPaise,
    ],
    [
      "Discount",
      discount,
    ],
    [
      "Taxable",
      input.totals
        .taxableAmountPaise,
    ],
    [
      "CGST",
      input.totals.cgstPaise,
    ],
    [
      "SGST",
      input.totals.sgstPaise,
    ],
    [
      "IGST",
      input.totals.igstPaise,
    ],
  ];

  let y =
    top - 20;

  rows.forEach(
    ([label, amount]) => {
      commands.push(
        pdfText(
          label,
          326,
          y,
          8,
          {
            color: slate,
          },
        ),
      );

      commands.push(
        pdfText(
          formatInrPaise(
            amount,
          ),
          539,
          y,
          8,
          {
            bold: true,
            color: navy,
            align: "right",
          },
        ),
      );

      y -= 17;
    },
  );

  commands.push(
    pdfLine(
      326,
      y + 5,
      539,
      y + 5,
      border,
      0.8,
    ),
  );

  y -= 15;

  commands.push(
    pdfText(
      "GRAND TOTAL",
      326,
      y,
      9,
      {
        bold: true,
        color: navy,
      },
    ),
  );

  commands.push(
    pdfText(
      formatInrPaise(
        input.totals
          .grandTotalPaise,
      ),
      539,
      y,
      12,
      {
        bold: true,
        color: navy,
        align: "right",
      },
    ),
  );

  return bottom;
}

/* ============================================================
   FOOTER
============================================================ */

function renderFooter(
  commands: string[],
  pageNumber: number,
  pageCount: number,
) {
  const muted =
    "0.55 0.60 0.67";

  const border =
    "0.87 0.89 0.92";

  commands.push(
    pdfLine(
      40,
      55,
      555,
      55,
      border,
      0.6,
    ),
  );

  commands.push(
    pdfText(
      "Generated by Hotel Management Software",
      40,
      38,
      7,
      {
        color: muted,
      },
    ),
  );

  commands.push(
    pdfText(
      `Page ${pageNumber} of ${pageCount}`,
      555,
      38,
      7,
      {
        color: muted,
        align: "right",
      },
    ),
  );
}

/* ============================================================
   PAGE
============================================================ */

function renderInvoicePage(
  input: PremiumInvoicePdfInput,
  lines: InvoiceLine[],
  pageNumber: number,
  pageCount: number,
  firstPage: boolean,
  finalPage: boolean,
) {
  const commands: string[] =
    [];

  commands.push(
    pdfRect(
      0,
      0,
      PAGE_WIDTH,
      PAGE_HEIGHT,
      "1 1 1",
    ),
  );

  renderPageHeader(
    commands,
    input,
    pageNumber,
    firstPage,
  );

  if (firstPage) {
    renderPropertyAndInvoiceInfo(
      commands,
      input,
    );

    renderGuestStayPanel(
      commands,
      input,
    );
  }

  const tableTop =
    firstPage
      ? 548
      : 714;

  const table =
    renderChargeTable(
      commands,
      lines,
      tableTop,
    );

  if (finalPage) {
    renderSummary(
      commands,
      input,
      table.bottomY,
    );
  }

  renderFooter(
    commands,
    pageNumber,
    pageCount,
  );

  return commands.join("\n");
}

/* ============================================================
   LOW-LEVEL PDF BUILDER
============================================================ */

function buildPdf(
  pageStreams: string[],
) {
  const objects: string[] =
    [];

  const pageCount =
    pageStreams.length;

  const regularFontId =
    3 + pageCount * 2;

  const boldFontId =
    regularFontId + 1;

  const pageIds: number[] =
    [];

  objects.push(
    "<< /Type /Catalog /Pages 2 0 R >>",
  );

  for (
    let index = 0;
    index < pageCount;
    index += 1
  ) {
    pageIds.push(
      3 + index * 2,
    );
  }

  objects.push(
    `<< /Type /Pages /Kids [${pageIds
      .map(
        (id) =>
          `${id} 0 R`,
      )
      .join(
        " ",
      )}] /Count ${pageCount} >>`,
  );

  pageStreams.forEach(
    (stream, index) => {
      const pageId =
        3 + index * 2;

      const contentId =
        pageId + 1;

      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
      );

      objects.push(
        `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
      );
    },
  );

  objects.push(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  );

  objects.push(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  );

  let output =
    "%PDF-1.4\n";

  const offsets = [0];

  for (
    let index = 0;
    index < objects.length;
    index += 1
  ) {
    offsets.push(
      output.length,
    );

    output +=
      `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xref =
    output.length;

  output += [
    "xref",
    `0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets
      .slice(1)
      .map(
        (offset) =>
          `${String(
            offset,
          ).padStart(
            10,
            "0",
          )} 00000 n `,
      ),
    `trailer << /Size ${
      objects.length + 1
    } /Root 1 0 R >>`,
    "startxref",
    String(xref),
    "%%EOF",
  ].join("\n");

  return new TextEncoder().encode(
    output,
  );
}

/* ============================================================
   PREMIUM INVOICE
============================================================ */

export function premiumInvoicePdf(
  input: PremiumInvoicePdfInput,
): Uint8Array {
  const sourceLines =
    input.lines.length
      ? input.lines
      : [
          {
            description:
              "No charge lines posted",
            quantity: 1,
            unitAmountPaise: 0,
            amountPaise: 0,
          },
        ];

  const chunks: InvoiceLine[][] =
    [];

  /*
   * Single page:
   * up to 9 charge rows comfortably
   * fit with dynamic totals.
   */
  if (
    sourceLines.length <= 9
  ) {
    chunks.push(
      sourceLines,
    );
  } else {
    let cursor = 0;

    const firstPageCount =
      Math.min(
        12,
        sourceLines.length - 1,
      );

    chunks.push(
      sourceLines.slice(
        0,
        firstPageCount,
      ),
    );

    cursor =
      firstPageCount;

    while (
      sourceLines.length -
        cursor >
      13
    ) {
      const remaining =
        sourceLines.length -
        cursor;

      const count =
        Math.min(
          18,
          remaining - 13,
        );

      chunks.push(
        sourceLines.slice(
          cursor,
          cursor + count,
        ),
      );

      cursor += count;
    }

    chunks.push(
      sourceLines.slice(
        cursor,
      ),
    );
  }

  const streams =
    chunks.map(
      (chunk, index) =>
        renderInvoicePage(
          input,
          chunk,
          index + 1,
          chunks.length,
          index === 0,
          index ===
            chunks.length - 1,
        ),
    );

  return buildPdf(
    streams,
  );
}

/* ============================================================
   OLD COMPATIBILITY RENDERER
============================================================ */

export function simpleFinancialPdf(
  title: string,
  rows: Array<
    [string, string]
  >,
): Uint8Array {
  const lines = [
    title,

    ...rows.map(
      ([label, value]) =>
        `${label}: ${value}`,
    ),
  ];

  const stream =
    `BT /F1 12 Tf 50 790 Td ${lines
      .map(
        (
          line,
          index,
        ) =>
          `${
            index
              ? "0 -22 Td "
              : ""
          }(${escapePdf(
            line,
          )}) Tj`,
      )
      .join(" ")} ET`;

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",

    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",

    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",

    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,

    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let output =
    "%PDF-1.4\n";

  const offsets = [0];

  for (
    let index = 0;
    index <
    objects.length;
    index += 1
  ) {
    offsets.push(
      output.length,
    );

    output +=
      `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xref =
    output.length;

  output += [
    "xref",

    `0 ${objects.length + 1}`,

    "0000000000 65535 f ",

    ...offsets
      .slice(1)
      .map(
        (offset) =>
          `${String(
            offset,
          ).padStart(
            10,
            "0",
          )} 00000 n `,
      ),

    `trailer << /Size ${
      objects.length + 1
    } /Root 1 0 R >>`,

    "startxref",

    String(xref),

    "%%EOF",
  ].join("\n");

  return new TextEncoder().encode(
    output,
  );
}