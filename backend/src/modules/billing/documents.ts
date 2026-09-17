const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;

type TextAlign = "left" | "right" | "center";
type FontStyle = "sans" | "serif" | "serifItalic" | "serifBold";

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
    cancelReason?: string | null;
  };

  customer: {
    name: string;
    company?: string | null;
    billingAddress?: string | null;
    gstin?: string | null;
  };

  stay: {
    reservation: string;
    folio?: string | null;
    dates: string;
    room: string;
  };

  payment?: {
    method?: string | null;
    reference?: string | null;
  };

  manager?: {
    name?: string | null;
    title?: string | null;
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

export type PremiumPaymentReceiptPdfInput = {
  source?: 'RESTAURANT';
  property: {
    name: string;
    address?: string | null;
    gstin?: string | null;
  };

  receipt: {
    number: string;
    status: string;
    receivedAt: string;
    method: string;
    reference?: string | null;
    notes?: string | null;
    receivedBy?: string | null;
  };

  guest: {
    name: string;
    reservation: string;
    folio?: string | null;
    room?: string | null;
  };

  manager?: {
    name?: string | null;
    title?: string | null;
  };

  amounts: {
    receivedPaise: number;
    refundedPaise: number;
    netPaise: number;
  };

  reversal?: {
    reversedAt?: string | null;
    reason?: string | null;
  } | null;
};

type TextOptions = {
  bold?: boolean;
  color?: string;
  align?: TextAlign;
  font?: FontStyle;
};

const C = {
  ink: "0.10 0.09 0.11",
  muted: "0.39 0.37 0.40",
  faint: "0.72 0.70 0.73",
  border: "0.78 0.77 0.79",
  greyBand: "0.82 0.82 0.82",
  lavender: "0.86 0.75 0.91",
  lavenderSoft: "0.95 0.91 0.97",
  purple: "0.36 0.02 0.50",
  purpleDark: "0.25 0.02 0.34",
  white: "1 1 1",
  red: "0.72 0.12 0.18",
  redSoft: "0.98 0.90 0.91",
  green: "0.10 0.43 0.25",
};

function escapePdf(value: string) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)")
    .replaceAll(/[^\x20-\x7e]/g, "?");
}

function estimateTextWidth(
  value: string,
  size: number,
  bold = false,
  font: FontStyle = "sans",
) {
  const serifFactor =
    font === "serif" || font === "serifItalic" || font === "serifBold"
      ? 0.49
      : 0.52;

  return value.length * size * (bold || font === "serifBold" ? serifFactor + 0.03 : serifFactor);
}

function resolveFont(options: TextOptions) {
  if (options.font === "serif") return "F3";
  if (options.font === "serifItalic") return "F4";
  if (options.font === "serifBold") return "F5";
  return options.bold ? "F2" : "F1";
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
    color = C.ink,
    align = "left",
    font = "sans",
  } = options;

  let textX = x;
  const width = estimateTextWidth(value, size, bold, font);

  if (align === "right") textX = x - width;
  if (align === "center") textX = x - width / 2;

  return [
    "BT",
    `/${resolveFont(options)} ${size} Tf`,
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
  color = C.border,
  width = 0.7,
) {
  return `${color} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S`;
}

function cleanText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function wrapText(value: string, maxChars: number) {
  const clean = cleanText(value);
  if (!clean) return [""];

  const words = clean.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;

    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) lines.push(current);
  return lines;
}

function truncateText(value: string, maxChars: number) {
  const clean = cleanText(value);
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, Math.max(1, maxChars - 3))}...`;
}

function humanize(value: unknown) {
  return cleanText(value)
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatMoneyNumber(value: number) {
  const rupees = Number(value || 0) / 100;

  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees);
}

export function formatInrPaise(value: number) {
  return `₹${formatMoneyNumber(value)}`;
}

function pdfRupeeSymbol(
  x: number,
  y: number,
  size: number,
  color = C.ink,
) {
  const s = size;
  const left = x;
  const top = y + s * 0.78;
  const middle = y + s * 0.56;
  const right = x + s * 0.68;
  const curveRight = x + s * 0.56;
  const stemLeft = x + s * 0.08;
  const diagonalStartX = x + s * 0.22;
  const diagonalStartY = y + s * 0.48;
  const diagonalEndX = x + s * 0.70;
  const diagonalEndY = y - s * 0.02;
  const stroke = Math.max(0.7, s * 0.08);

  return [
    `${color} RG ${stroke.toFixed(2)} w`,
    `${left.toFixed(2)} ${top.toFixed(2)} m ${right.toFixed(2)} ${top.toFixed(2)} l S`,
    `${left.toFixed(2)} ${middle.toFixed(2)} m ${right.toFixed(2)} ${middle.toFixed(2)} l S`,
    `${stemLeft.toFixed(2)} ${top.toFixed(2)} m ${curveRight.toFixed(2)} ${top.toFixed(2)} ${curveRight.toFixed(2)} ${middle.toFixed(2)} ${stemLeft.toFixed(2)} ${middle.toFixed(2)} c S`,
    `${diagonalStartX.toFixed(2)} ${diagonalStartY.toFixed(2)} m ${diagonalEndX.toFixed(2)} ${diagonalEndY.toFixed(2)} l S`,
  ].join(" ");
}

function pdfMoney(
  value: number,
  x: number,
  y: number,
  size = 10,
  options: TextOptions = {},
) {
  const {
    bold = false,
    color = C.ink,
    align = "left",
    font = "sans",
  } = options;

  const amount = formatMoneyNumber(value);
  const symbolWidth = size * 0.72;
  const gap = size * 0.22;
  const amountWidth = estimateTextWidth(amount, size, bold, font);
  const totalWidth = symbolWidth + gap + amountWidth;

  let startX = x;
  if (align === "right") startX = x - totalWidth;
  if (align === "center") startX = x - totalWidth / 2;

  return [
    pdfRupeeSymbol(startX, y, size, color),
    pdfText(amount, startX + symbolWidth + gap, y, size, {
      ...options,
      align: "left",
    }),
  ].join(" ");
}

function buildPdf(pageStreams: string[]) {
  const objects: string[] = [];
  const pageCount = pageStreams.length;
  const pageIds: number[] = [];

  objects.push("<< /Type /Catalog /Pages 2 0 R >>");

  for (let index = 0; index < pageCount; index += 1) {
    pageIds.push(3 + index * 2);
  }

  objects.push(
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageCount} >>`,
  );

  const firstFontId = 3 + pageCount * 2;
  const fontIds = {
    F1: firstFontId,
    F2: firstFontId + 1,
    F3: firstFontId + 2,
    F4: firstFontId + 3,
    F5: firstFontId + 4,
  };

  pageStreams.forEach((stream, index) => {
    const pageId = 3 + index * 2;
    const contentId = pageId + 1;

    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontIds.F1} 0 R /F2 ${fontIds.F2} 0 R /F3 ${fontIds.F3} 0 R /F4 ${fontIds.F4} 0 R /F5 ${fontIds.F5} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );

    objects.push(
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
  });

  objects.push(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Italic >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>",
  );

  let output = "%PDF-1.4\n";
  const offsets = [0];

  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(output.length);
    output += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xref = output.length;

  output += [
    "xref",
    `0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets
      .slice(1)
      .map(
        (offset) =>
          `${String(offset).padStart(10, "0")} 00000 n `,
      ),
    `trailer << /Size ${objects.length + 1} /Root 1 0 R >>`,
    "startxref",
    String(xref),
    "%%EOF",
  ].join("\n");

  return new TextEncoder().encode(output);
}

function renderBrandBand(
  commands: string[],
  propertyName: string,
  subtitle = "HOTEL & RESORT",
) {
  commands.push(
    pdfRect(0, 742, 308, 100, C.greyBand),
    pdfRect(308, 742, PAGE_WIDTH - 308, 100, C.lavender),
  );

  commands.push(
    pdfText(
      truncateText(propertyName || "Hotel", 28),
      452,
      790,
      23,
      {
        color: C.ink,
        align: "center",
        font: "serifItalic",
      },
    ),
  );

  commands.push(
    pdfText(
      subtitle,
      452,
      768,
      8,
      {
        color: C.ink,
        align: "center",
        font: "serif",
      },
    ),
  );
}

function renderBottomAccent(commands: string[]) {
  commands.push(pdfRect(0, 0, PAGE_WIDTH, 22, C.lavender));
}

function invoiceLineHeight(line: InvoiceLine) {
  const descriptionLines = wrapText(line.description, 40);
  return Math.max(36, 18 + Math.min(descriptionLines.length, 3) * 11);
}

type InvoiceChunk = {
  lines: InvoiceLine[];
  firstPage: boolean;
  finalPage: boolean;
};

function takeChunk(
  source: InvoiceLine[],
  start: number,
  budget: number,
) {
  const chunk: InvoiceLine[] = [];
  let used = 0;
  let cursor = start;

  while (cursor < source.length) {
    const height = invoiceLineHeight(source[cursor]);

    if (chunk.length > 0 && used + height > budget) break;

    chunk.push(source[cursor]);
    used += height;
    cursor += 1;
  }

  return {
    chunk,
    next: cursor,
    used,
  };
}

function paginateInvoiceLines(lines: InvoiceLine[]): InvoiceChunk[] {
  const source =
    lines.length > 0
      ? lines
      : [
          {
            description: "No charge lines posted",
            quantity: 1,
            unitAmountPaise: 0,
            amountPaise: 0,
          },
        ];

  const totalHeight = source.reduce(
    (sum, line) => sum + invoiceLineHeight(line),
    0,
  );

  if (totalHeight <= 280) {
    return [
      {
        lines: source,
        firstPage: true,
        finalPage: true,
      },
    ];
  }

  const chunks: InvoiceChunk[] = [];
  let cursor = 0;

  const first = takeChunk(source, cursor, 500);
  chunks.push({
    lines: first.chunk,
    firstPage: true,
    finalPage: false,
  });
  cursor = first.next;

  while (cursor < source.length) {
    const remaining = source.slice(cursor);
    const remainingHeight = remaining.reduce(
      (sum, line) => sum + invoiceLineHeight(line),
      0,
    );

    if (remainingHeight <= 380) {
      chunks.push({
        lines: remaining,
        firstPage: false,
        finalPage: true,
      });
      cursor = source.length;
      break;
    }

    const middle = takeChunk(source, cursor, 600);

    chunks.push({
      lines: middle.chunk,
      firstPage: false,
      finalPage: false,
    });

    cursor = middle.next;
  }

  if (chunks.length && !chunks.some((chunk) => chunk.finalPage)) {
    chunks[chunks.length - 1].finalPage = true;
  }

  return chunks;
}

function renderInvoiceIdentity(
  commands: string[],
  input: PremiumInvoicePdfInput,
) {
  commands.push(
    pdfText("INVOICE", 18, 704, 30, {
      color: C.purple,
      font: "serif",
    }),
  );

  commands.push(
    pdfText("Date", 20, 682, 8, {
      bold: true,
      color: C.ink,
    }),
    pdfText(input.invoice.date, 72, 682, 8, {
      color: C.ink,
    }),
    pdfText("No", 20, 667, 8, {
      bold: true,
      color: C.ink,
    }),
    pdfText(input.invoice.number, 72, 667, 8, {
      color: C.ink,
    }),
  );

  const status = cleanText(input.invoice.status || "ISSUED").toUpperCase();

  commands.push(
    pdfText("Invoice to", 405, 718, 10, {
      color: C.ink,
      align: "center",
      font: "serif",
    }),
    pdfText(
      truncateText(input.customer.name || "Guest", 26),
      405,
      690,
      21,
      {
        color: C.purple,
        align: "center",
        font: "serif",
      },
    ),
  );

  const customerDetail = [
    input.customer.company,
    input.customer.billingAddress,
  ]
    .filter(Boolean)
    .join(" | ");

  const detailLines = wrapText(
    customerDetail || "Direct guest",
    42,
  ).slice(0, 2);

  detailLines.forEach((line, index) => {
    commands.push(
      pdfText(line, 405, 669 - index * 11, 7.5, {
        color: C.ink,
        align: "center",
      }),
    );
  });

  const taxLine = input.customer.gstin
    ? `GSTIN: ${input.customer.gstin}`
    : "GSTIN: Not supplied";

  commands.push(
    pdfText(taxLine, 405, 644, 7.2, {
      color: C.muted,
      align: "center",
    }),
  );

  commands.push(
    pdfText(
      `Status: ${status}  |  Booking: ${input.stay.reservation}${input.stay.folio ? `  |  Folio: ${input.stay.folio}` : ""}`,
      20,
      635,
      7.2,
      {
        color: status === "CANCELLED" ? C.red : C.muted,
      },
    ),
    pdfText(
      `Stay: ${input.stay.dates}  |  Room: ${input.stay.room}`,
      20,
      623,
      7.2,
      {
        color: C.muted,
      },
    ),
  );

  if (status === "CANCELLED") {
    commands.push(
      pdfRect(430, 614, 145, 20, C.redSoft),
      pdfText("CANCELLED", 502, 621, 8, {
        bold: true,
        color: C.red,
        align: "center",
      }),
    );
  }
}

function renderInvoiceContinuationHeader(
  commands: string[],
  input: PremiumInvoicePdfInput,
  pageNumber: number,
) {
  commands.push(
    pdfRect(0, 776, PAGE_WIDTH, 66, C.lavenderSoft),
    pdfText(
      truncateText(input.property.name || "Hotel", 32),
      24,
      807,
      16,
      {
        color: C.purpleDark,
        font: "serifItalic",
      },
    ),
    pdfText("INVOICE CONTINUED", 570, 808, 10, {
      bold: true,
      color: C.purple,
      align: "right",
    }),
    pdfText(input.invoice.number, 570, 790, 8, {
      color: C.ink,
      align: "right",
    }),
    pdfText(`Page ${pageNumber}`, 570, 775, 7, {
      color: C.muted,
      align: "right",
    }),
  );
}

function renderInvoiceTable(
  commands: string[],
  lines: InvoiceLine[],
  startY: number,
  startNumber: number,
) {
  const headerY = startY;

  commands.push(
    pdfRect(0, headerY, PAGE_WIDTH, 31, C.greyBand),
    pdfText("NO.", 64, headerY + 11, 8, {
      color: C.ink,
      align: "center",
      font: "serif",
    }),
    pdfText("ITEM DESCRIPTION", 175, headerY + 11, 8, {
      color: C.ink,
      align: "center",
      font: "serif",
    }),
    pdfText("QTY", 333, headerY + 11, 8, {
      color: C.ink,
      align: "center",
      font: "serif",
    }),
    pdfText("PRICE", 437, headerY + 11, 8, {
      color: C.ink,
      align: "center",
      font: "serif",
    }),
    pdfText("TOTAL", 548, headerY + 11, 8, {
      color: C.ink,
      align: "center",
      font: "serif",
    }),
  );

  let y = headerY - 9;
  let itemNo = startNumber;

  for (const item of lines) {
    const height = invoiceLineHeight(item);
    const rowBottom = y - height + 8;
    const descriptionLines = wrapText(item.description, 40);

    commands.push(
      pdfText(`${itemNo}.`, 63, y - 13, 8.5, {
        color: C.ink,
        align: "center",
        font: "serif",
      }),
      pdfText(String(item.quantity), 333, y - 13, 8.5, {
        color: C.ink,
        align: "center",
        font: "serif",
      }),
      pdfMoney(item.unitAmountPaise, 472, y - 13, 8.2, {
        color: C.ink,
        align: "right",
        font: "serif",
      }),
      pdfMoney(item.amountPaise, 575, y - 13, 8.2, {
        color: C.ink,
        align: "right",
        font: "serif",
      }),
    );

    descriptionLines.slice(0, 3).forEach((line, index) => {
      commands.push(
        pdfText(line, 130, y - 13 - index * 11, 8.2, {
          color: C.ink,
          font: "serif",
        }),
      );
    });

    commands.push(
      pdfLine(50, rowBottom, 575, rowBottom, "0.82 0.82 0.82", 0.6),
    );

    y = rowBottom - 4;
    itemNo += 1;
  }

  return {
    bottomY: y,
    nextNumber: itemNo,
  };
}

function renderInvoiceSummary(
  commands: string[],
  input: PremiumInvoicePdfInput,
  tableBottomY: number,
) {
  const top = Math.min(tableBottomY - 10, 330);
  const labelX = 57;
  const valueX = 567;

  const totals: Array<[string, number]> = [
    ["SUB TOTAL", input.totals.subtotalPaise],
  ];

  if (input.totals.discountPaise) {
    totals.push([
      "DISCOUNT",
      -Math.abs(input.totals.discountPaise),
    ]);
  }

  totals.push([
    "TAXABLE AMOUNT",
    input.totals.taxableAmountPaise,
  ]);

  // GST is rendered from the immutable invoice snapshot.
  // Intra-state invoices normally carry CGST + SGST; inter-state invoices
  // carry IGST. Zero-value tax components are intentionally hidden so the
  // customer-facing invoice only shows taxes that actually apply.
  if (input.totals.cgstPaise) {
    totals.push(["CGST", input.totals.cgstPaise]);
  }

  if (input.totals.sgstPaise) {
    totals.push(["SGST", input.totals.sgstPaise]);
  }

  if (input.totals.igstPaise) {
    totals.push(["IGST", input.totals.igstPaise]);
  }

  let y = top;

  totals.forEach(([label, amount]) => {
    commands.push(
      pdfText(label, labelX, y, 8.5, {
        bold: true,
        color: C.ink,
        font: "serif",
      }),
      pdfMoney(amount, valueX, y, 8.5, {
        color: C.ink,
        align: "right",
        font: "serif",
      }),
    );

    y -= 17;
  });

  commands.push(pdfLine(50, y + 8, 575, y + 8, C.border, 0.7));

  y -= 8;

  commands.push(
    pdfText("GRAND TOTAL", labelX, y, 10, {
      bold: true,
      color: C.ink,
      font: "serifBold",
    }),
    pdfMoney(
      input.totals.grandTotalPaise,
      valueX,
      y,
      10,
      {
        color: C.ink,
        align: "right",
        font: "serifBold",
      },
    ),
  );

  const detailTop = y - 45;
  const method = cleanText(input.payment?.method || "Not recorded");
  const reference = cleanText(input.payment?.reference || "Not provided");
  const managerName = cleanText(input.manager?.name || "Authorized Manager");
  const managerTitle = cleanText(input.manager?.title || "Manager");
  const due = Number(input.totals.balancePaise || 0);

  commands.push(
    pdfText("Payment Method:", 50, detailTop, 8.5, {
      bold: true,
      color: C.ink,
      font: "serifBold",
    }),
    pdfText(`Method: ${method}`, 50, detailTop - 14, 8, {
      color: C.ink,
      font: "serif",
    }),
    pdfText(`Reference: ${reference}`, 50, detailTop - 27, 8, {
      color: C.ink,
      font: "serif",
    }),
    pdfText("Paid:", 50, detailTop - 40, 8, {
      color: C.ink,
      font: "serif",
    }),
    pdfMoney(input.totals.paidPaise, 120, detailTop - 40, 8, {
      color: C.ink,
      align: "right",
      font: "serif",
    }),
    pdfText("|  Balance:", 132, detailTop - 40, 8, {
      color: C.ink,
      font: "serif",
    }),
    pdfMoney(due, 245, detailTop - 40, 8, {
      color: C.ink,
      align: "right",
      font: "serif",
    }),
  );

  commands.push(
    pdfText(
      truncateText(managerName, 28),
      512,
      detailTop - 8,
      9,
      {
        color: C.ink,
        align: "center",
        font: "serifBold",
      },
    ),
    pdfText(
      truncateText(humanize(managerTitle) || "Manager", 28),
      512,
      detailTop - 23,
      8,
      {
        color: C.ink,
        align: "center",
        font: "serif",
      },
    ),
  );

  const termsY = Math.max(74, detailTop - 70);

  commands.push(
    pdfText("Terms & Conditions:", 50, termsY, 8.5, {
      bold: true,
      color: C.ink,
      font: "serifBold",
    }),
    pdfText(
      "This is a computer-generated tax invoice.",
      50,
      termsY - 14,
      7.7,
      {
        color: C.ink,
        font: "serif",
      },
    ),
    pdfText(
      "Please contact the property for billing or payment queries.",
      50,
      termsY - 27,
      7.7,
      {
        color: C.ink,
        font: "serif",
      },
    ),
  );

  if (
    String(input.invoice.status || "").toUpperCase() === "CANCELLED" &&
    input.invoice.cancelReason
  ) {
    commands.push(
      pdfText(
        `Cancellation: ${truncateText(input.invoice.cancelReason, 62)}`,
        50,
        termsY - 42,
        7.5,
        {
          color: C.red,
        },
      ),
    );
  }

  commands.push(
    pdfText("Thank you for your business with us!", 50, 42, 8.5, {
      bold: true,
      color: C.purple,
      font: "serifBold",
    }),
  );
}

function renderInvoicePage(
  input: PremiumInvoicePdfInput,
  chunk: InvoiceChunk,
  pageNumber: number,
  pageCount: number,
  startNumber: number,
) {
  const commands: string[] = [];

  commands.push(pdfRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, C.white));

  if (chunk.firstPage) {
    renderBrandBand(commands, input.property.name, "HOTEL & RESORT");
    renderInvoiceIdentity(commands, input);
  } else {
    renderInvoiceContinuationHeader(commands, input, pageNumber);
  }

  const tableTop = chunk.firstPage ? 581 : 711;
  const table = renderInvoiceTable(
    commands,
    chunk.lines,
    tableTop,
    startNumber,
  );

  if (chunk.finalPage) {
    renderInvoiceSummary(commands, input, table.bottomY);
  }

  if (!chunk.finalPage) {
    commands.push(
      pdfText(
        `Continued on page ${pageNumber + 1}`,
        570,
        44,
        7,
        {
          color: C.muted,
          align: "right",
        },
      ),
    );
  }

  commands.push(
    pdfText(
      `Page ${pageNumber} of ${pageCount}`,
      570,
      27,
      6.8,
      {
        color: C.muted,
        align: "right",
      },
    ),
  );

  renderBottomAccent(commands);
  return commands.join("\n");
}

export function premiumInvoicePdf(
  input: PremiumInvoicePdfInput,
): Uint8Array {
  const chunks = paginateInvoiceLines(input.lines);
  const streams: string[] = [];
  let itemNumber = 1;

  chunks.forEach((chunk, index) => {
    streams.push(
      renderInvoicePage(
        input,
        chunk,
        index + 1,
        chunks.length,
        itemNumber,
      ),
    );

    itemNumber += chunk.lines.length;
  });

  return buildPdf(streams);
}

function renderReceiptIdentity(
  commands: string[],
  input: PremiumPaymentReceiptPdfInput,
) {
  commands.push(
    pdfText("PAYMENT RECEIPT", 18, 704, 27, {
      color: C.purple,
      font: "serif",
    }),
  );

  commands.push(
    pdfText("Date", 20, 682, 8, {
      bold: true,
      color: C.ink,
    }),
    pdfText(input.receipt.receivedAt, 72, 682, 8, {
      color: C.ink,
    }),
    pdfText("No", 20, 667, 8, {
      bold: true,
      color: C.ink,
    }),
    pdfText(input.receipt.number, 72, 667, 8, {
      color: C.ink,
    }),
  );

  commands.push(
    pdfText("GUEST / CLIENT", 405, 718, 10, {
      color: C.ink,
      align: "center",
      font: "serif",
    }),
    pdfText(
      truncateText(input.guest.name || "Guest", 26),
      405,
      690,
      21,
      {
        color: C.purple,
        align: "center",
        font: "serif",
      },
    ),
    pdfText(
      `${input.source === 'RESTAURANT' ? 'Order' : 'Booking'}: ${input.guest.reservation}`,
      405,
      670,
      7.8,
      {
        color: C.ink,
        align: "center",
      },
    ),
    pdfText(
      input.source === 'RESTAURANT' ? 'Restaurant POS payment' : `Folio: ${input.guest.folio || "Not assigned"}`,
      405,
      657,
      7.8,
      {
        color: C.ink,
        align: "center",
      },
    ),
    pdfText(
      `${input.source === 'RESTAURANT' ? 'Service' : 'Room'}: ${input.guest.room || "TBA"}`,
      405,
      644,
      7.8,
      {
        color: C.ink,
        align: "center",
      },
    ),
  );

  const status = cleanText(input.receipt.status || "RECEIVED").toUpperCase();

  commands.push(
    pdfText(
      `Status: ${status}`,
      20,
      616,
      7.5,
      {
        bold: true,
        color: status === "REVERSED" ? C.red : C.green,
      },
    ),
    pdfText(
      truncateText(input.property.address || "Address not configured", 65),
      20,
      602,
      7.2,
      {
        color: C.muted,
      },
    ),
    pdfText(
      `GSTIN: ${input.property.gstin || "Not configured"}`,
      20,
      590,
      7.2,
      {
        color: C.muted,
      },
    ),
  );
}

function renderReceiptBody(
  commands: string[],
  input: PremiumPaymentReceiptPdfInput,
) {
  commands.push(
    pdfRect(0, 555, PAGE_WIDTH, 31, C.greyBand),
    pdfText("PAYMENT DETAILS", 115, 566, 8, {
      color: C.ink,
      align: "center",
      font: "serif",
    }),
    pdfText("METHOD", 305, 566, 8, {
      color: C.ink,
      align: "center",
      font: "serif",
    }),
    pdfText("REFERENCE", 425, 566, 8, {
      color: C.ink,
      align: "center",
      font: "serif",
    }),
    pdfText("AMOUNT", 548, 566, 8, {
      color: C.ink,
      align: "center",
      font: "serif",
    }),
  );

  commands.push(
    pdfText("Payment received", 115, 523, 9, {
      color: C.ink,
      align: "center",
      font: "serif",
    }),
    pdfText(humanize(input.receipt.method), 305, 523, 9, {
      color: C.ink,
      align: "center",
      font: "serif",
    }),
    pdfText(
      truncateText(input.receipt.reference || "Not provided", 18),
      425,
      523,
      8.4,
      {
        color: C.ink,
        align: "center",
        font: "serif",
      },
    ),
    pdfMoney(
      input.amounts.receivedPaise,
      575,
      523,
      8.5,
      {
        color: C.ink,
        align: "right",
        font: "serif",
      },
    ),
    pdfLine(50, 500, 575, 500),
  );

  const summaryRows: Array<[string, number]> = [
    ["AMOUNT RECEIVED", input.amounts.receivedPaise],
    ["REFUNDED", input.amounts.refundedPaise],
  ];

  let y = 466;

  summaryRows.forEach(([label, value]) => {
    commands.push(
      pdfText(label, 57, y, 8.5, {
        bold: true,
        color: C.ink,
        font: "serif",
      }),
      pdfMoney(value, 567, y, 8.5, {
        color: C.ink,
        align: "right",
        font: "serif",
      }),
    );

    y -= 20;
  });

  commands.push(
    pdfLine(50, y + 7, 575, y + 7),
    pdfText("NET RETAINED", 57, y - 7, 10, {
      color: C.ink,
      font: "serifBold",
    }),
    pdfMoney(
      input.amounts.netPaise,
      567,
      y - 7,
      10,
      {
        color: C.ink,
        align: "right",
        font: "serifBold",
      },
    ),
  );

  const infoY = y - 55;
  const managerName = cleanText(
    input.manager?.name ||
      input.receipt.receivedBy ||
      "Authorized Manager",
  );
  const managerTitle = cleanText(input.manager?.title || "Manager");

  commands.push(
    pdfText("Payment Method:", 50, infoY, 8.5, {
      color: C.ink,
      font: "serifBold",
    }),
    pdfText(`Method: ${humanize(input.receipt.method)}`, 50, infoY - 14, 8, {
      color: C.ink,
      font: "serif",
    }),
    pdfText(
      `Reference: ${input.receipt.reference || "Not provided"}`,
      50,
      infoY - 27,
      8,
      {
        color: C.ink,
        font: "serif",
      },
    ),
    pdfText(
      `Notes: ${truncateText(input.receipt.notes || "No payment notes", 56)}`,
      50,
      infoY - 40,
      8,
      {
        color: C.ink,
        font: "serif",
      },
    ),
  );

  commands.push(
    pdfText(
      truncateText(managerName, 28),
      510,
      infoY - 6,
      9,
      {
        color: C.ink,
        align: "center",
        font: "serifBold",
      },
    ),
    pdfText(
      truncateText(humanize(managerTitle) || "Manager", 28),
      510,
      infoY - 21,
      8,
      {
        color: C.ink,
        align: "center",
        font: "serif",
      },
    ),
  );

  const status = cleanText(input.receipt.status).toUpperCase();

  if (status === "REVERSED") {
    commands.push(
      pdfRect(50, 122, 525, 62, C.redSoft),
      pdfText("PAYMENT REVERSED", 63, 164, 8.5, {
        bold: true,
        color: C.red,
      }),
      pdfText(
        `Reason: ${truncateText(input.reversal?.reason || "Not provided", 62)}`,
        63,
        145,
        7.7,
        {
          color: C.red,
        },
      ),
      pdfText(
        `Reversed at: ${input.reversal?.reversedAt || "-"}`,
        63,
        130,
        7.5,
        {
          color: C.red,
        },
      ),
    );
  } else {
    commands.push(
      pdfText("Terms & Conditions:", 50, 153, 8.5, {
        color: C.ink,
        font: "serifBold",
      }),
      pdfText(
        input.source === 'RESTAURANT' ? "This receipt confirms the payment recorded against the restaurant order." : "This receipt confirms the payment recorded against the reservation.",
        50,
        138,
        7.7,
        {
          color: C.ink,
          font: "serif",
        },
      ),
      pdfText(
        "Please retain this receipt for your records.",
        50,
        125,
        7.7,
        {
          color: C.ink,
          font: "serif",
        },
      ),
    );
  }

  commands.push(
    pdfText("Thank you for your business with us!", 50, 54, 8.5, {
      bold: true,
      color: C.purple,
      font: "serifBold",
    }),
  );
}

export function premiumPaymentReceiptPdf(
  input: PremiumPaymentReceiptPdfInput,
): Uint8Array {
  const commands: string[] = [];

  commands.push(pdfRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, C.white));
  renderBrandBand(commands, input.property.name, "HOTEL & RESORT");
  renderReceiptIdentity(commands, input);
  renderReceiptBody(commands, input);
  renderBottomAccent(commands);

  return buildPdf([commands.join("\n")]);
}

export function simpleFinancialPdf(
  title: string,
  rows: Array<[string, string]>,
): Uint8Array {
  const commands: string[] = [];

  commands.push(
    pdfRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, C.white),
    pdfRect(0, 742, PAGE_WIDTH, 100, C.lavenderSoft),
    pdfText(title, 32, 786, 24, {
      color: C.purple,
      font: "serif",
    }),
  );

  let y = 700;

  rows.forEach(([label, value]) => {
    const valueLines = wrapText(value, 55);

    commands.push(
      pdfText(label.toUpperCase(), 45, y, 7.5, {
        bold: true,
        color: C.muted,
      }),
    );

    valueLines.forEach((line, index) => {
      commands.push(
        pdfText(line, 200, y - index * 12, 9, {
          color: C.ink,
        }),
      );
    });

    y -= Math.max(30, valueLines.length * 13 + 12);
    commands.push(pdfLine(45, y + 12, 550, y + 12, C.border, 0.5));
  });

  renderBottomAccent(commands);
  return buildPdf([commands.join("\n")]);
}
