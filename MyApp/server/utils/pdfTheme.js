const PDFDocument = require("pdfkit");

const PDF_THEME = {
  bg: "#ffffff",
  text: "#111111",
  textMuted: "#555555",
  line: "#cfcfcf",
  lineSoft: "#e5e5e5",
  tableHeaderText: "#111111",
  emptyText: "#666666",
};

const DEFAULT_DOC_OPTIONS = {
  size: "A4",
  layout: "portrait",
  margin: 40,
  bufferPages: true,
};

const formatPdfDateValue = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "long",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getPageWidth = (doc) =>
  doc.page.width - doc.page.margins.left - doc.page.margins.right;

const createPdfDocument = (options = {}) =>
  new PDFDocument({
    ...DEFAULT_DOC_OPTIONS,
    ...options,
  });

const ensurePdfPageSpace = (doc, neededSpace = 80) => {
  const safeBottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + neededSpace > safeBottom) {
    doc.addPage();
  }
};

const drawDivider = (doc, y = doc.y) => {
  const startX = doc.page.margins.left;
  const endX = doc.page.width - doc.page.margins.right;

  doc
    .moveTo(startX, y)
    .lineTo(endX, y)
    .strokeColor(PDF_THEME.line)
    .lineWidth(1)
    .stroke()
    .strokeColor("#000000")
    .lineWidth(1);
};

const drawPdfHeader = (doc, config = {}) => {
  const {
    title,
    subtitle = "",
    generatedAt = new Date(),
  } = config;

  const width = getPageWidth(doc);
  const x = doc.page.margins.left;
  const y = doc.y;

  doc
    .fillColor(PDF_THEME.text)
    .font("Helvetica-Bold")
    .fontSize(18)
    .text(title || "Report", x, y, {
      width,
      align: "center",
    });

  if (subtitle) {
    doc
      .moveDown(0.2)
      .fillColor(PDF_THEME.textMuted)
      .font("Helvetica")
      .fontSize(10)
      .text(subtitle, x, doc.y, {
        width,
        align: "center",
      });
  }

  doc
    .moveDown(0.25)
    .fillColor(PDF_THEME.textMuted)
    .font("Helvetica")
    .fontSize(9)
    .text(`Generated: ${formatPdfDateValue(generatedAt)}`, x, doc.y, {
      width,
      align: "center",
    });

  doc.moveDown(0.45);
  drawDivider(doc, doc.y);
  doc.moveDown(0.65);
};

const drawPdfSectionTitle = (doc, title, options = {}) => {
  const { spacingBefore = 0.25, spacingAfter = 0.35 } = options;

  ensurePdfPageSpace(doc, 40);
  doc.moveDown(spacingBefore);

  const x = doc.page.margins.left;
  const width = getPageWidth(doc);

  doc
    .fillColor(PDF_THEME.text)
    .font("Helvetica-Bold")
    .fontSize(12)
    .text(title || "", x, doc.y, { width });

  doc.moveDown(0.15);
  drawDivider(doc, doc.y);
  doc.moveDown(spacingAfter);
};

const drawPdfLabelValue = (doc, label, value, options = {}) => {
  const {
    labelWidth = 140,
    fontSize = 9.5,
    spacingAfter = 2,
  } = options;

  ensurePdfPageSpace(doc, 24);

  const x = doc.page.margins.left;
  const y = doc.y;
  const width = getPageWidth(doc);
  const valueText = value === undefined || value === null || value === "" ? "-" : String(value);

  doc
    .fillColor(PDF_THEME.text)
    .font("Helvetica-Bold")
    .fontSize(fontSize)
    .text(label || "-", x, y, {
      width: labelWidth,
      continued: false,
      align: "left",
    });

  doc
    .fillColor(PDF_THEME.text)
    .font("Helvetica")
    .fontSize(fontSize)
    .text(valueText, x + labelWidth, y, {
      width: width - labelWidth,
      align: "left",
    });

  doc.y += spacingAfter;
};

const drawPdfParagraphBlock = (doc, title, body, options = {}) => {
  const {
    titleFontSize = 10,
    bodyFontSize = 10,
    spacingAfter = 0.45,
  } = options;

  ensurePdfPageSpace(doc, 60);

  if (title) {
    doc
      .fillColor(PDF_THEME.text)
      .font("Helvetica-Bold")
      .fontSize(titleFontSize)
      .text(title);

    doc.moveDown(0.15);
  }

  doc
    .fillColor(PDF_THEME.text)
    .font("Helvetica")
    .fontSize(bodyFontSize)
    .text(body || "-", {
      lineGap: 2,
    });

  doc.moveDown(spacingAfter);
};

const drawPdfBulletList = (doc, title, items = [], options = {}) => {
  if (!Array.isArray(items) || !items.length) {
    return;
  }

  const { fontSize = 9.5 } = options;

  ensurePdfPageSpace(doc, 40 + items.length * 18);

  if (title) {
    doc
      .fillColor(PDF_THEME.text)
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(title);

    doc.moveDown(0.2);
  }

  items.forEach((item) => {
    ensurePdfPageSpace(doc, 18);
    doc
      .fillColor(PDF_THEME.text)
      .font("Helvetica")
      .fontSize(fontSize)
      .text(`- ${item}`);
  });

  doc.moveDown(0.45);
};

const drawPdfEmptyState = (doc, message, options = {}) => {
  const { fontSize = 9.5 } = options;

  ensurePdfPageSpace(doc, 28);
  doc
    .fillColor(PDF_THEME.emptyText)
    .font("Helvetica-Oblique")
    .fontSize(fontSize)
    .text(message || "No data available.");
  doc.moveDown(0.45);
};

const normalizeCell = (value) => {
  if (value === undefined || value === null || value === "") return "-";
  return String(value);
};

const fitPdfTableColumns = (doc, columns = []) => {
  const printableWidth = getPageWidth(doc);
  const totalWidth = columns.reduce((sum, col) => sum + Number(col.width || 0), 0);

  if (!totalWidth || totalWidth <= printableWidth) {
    return columns;
  }

  const scale = printableWidth / totalWidth;
  let usedWidth = 0;

  return columns.map((col, index) => {
    const width =
      index === columns.length - 1
        ? Math.max(24, printableWidth - usedWidth)
        : Math.max(24, Math.floor(Number(col.width || 0) * scale));

    usedWidth += width;
    return { ...col, width };
  });
};

const drawPdfTable = (doc, columns = [], rows = [], options = {}) => {
  if (!Array.isArray(columns) || !columns.length) return;

  const {
    rowHeight = 24,
    headerHeight = 18,
    fontSize = 8.5,
    emptyMessage = "No data available.",
  } = options;

  if (!Array.isArray(rows) || !rows.length) {
    drawPdfEmptyState(doc, emptyMessage, { fontSize: 10 });
    return;
  }

  const fittedColumns = fitPdfTableColumns(doc, columns);

  const drawHeader = () => {
    ensurePdfPageSpace(doc, headerHeight + rowHeight);

    const startX = doc.page.margins.left;
    const startY = doc.y;
    let x = startX;

    doc.font("Helvetica-Bold").fontSize(fontSize).fillColor(PDF_THEME.tableHeaderText);

    fittedColumns.forEach((col) => {
      doc.text(col.label, x, startY, {
        width: col.width,
        align: col.align || "left",
        height: headerHeight - 4,
        ellipsis: true,
        lineBreak: false,
      });
      x += col.width;
    });

    doc
      .moveTo(startX, startY + headerHeight - 2)
      .lineTo(doc.page.width - doc.page.margins.right, startY + headerHeight - 2)
      .strokeColor(PDF_THEME.line)
      .lineWidth(1)
      .stroke()
      .strokeColor("#000000")
      .lineWidth(1);

    doc.y = startY + headerHeight;
    doc.font("Helvetica").fontSize(fontSize).fillColor(PDF_THEME.text);
  };

  drawHeader();

  rows.forEach((row) => {
    ensurePdfPageSpace(doc, rowHeight + 12);

    // Repeat the header on the new page for long tables.
    if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      drawHeader();
    }

    const startX = doc.page.margins.left;
    const startY = doc.y;
    let x = startX;

    fittedColumns.forEach((col) => {
      const rawValue = row?.[col.key];
      const finalValue = typeof col.format === "function" ? col.format(rawValue, row) : rawValue;

      doc.text(normalizeCell(finalValue), x, startY, {
        width: col.width,
        align: col.align || "left",
        height: rowHeight - 6,
        ellipsis: true,
      });
      x += col.width;
    });

    doc
      .moveTo(startX, startY + rowHeight - 4)
      .lineTo(doc.page.width - doc.page.margins.right, startY + rowHeight - 4)
      .strokeColor(PDF_THEME.lineSoft)
      .lineWidth(1)
      .stroke()
      .strokeColor("#000000")
      .lineWidth(1);

    doc.y = startY + rowHeight;
    doc.font("Helvetica").fontSize(fontSize).fillColor(PDF_THEME.text);
  });

  doc.moveDown(0.4);
};

const drawPdfFooter = (doc, options = {}) => {
  const {
    generatedAt = new Date(),
    text = `Document generated on ${formatPdfDateValue(generatedAt)}`,
  } = options;

  ensurePdfPageSpace(doc, 28);
  doc.moveDown(0.55);
  drawDivider(doc, doc.y);
  doc.moveDown(0.3);
  doc
    .fillColor(PDF_THEME.textMuted)
    .font("Helvetica")
    .fontSize(9)
    .text(text, {
      align: "right",
    });
};

const drawPdfImageGrid = (doc, images = [], options = {}) => {
  const {
    columns = 2,
    imageHeight = 120,
    gap = 14,
    captionHeight = 28,
    emptyMessage = "No images available.",
  } = options;

  const safeImages = Array.isArray(images) ? images.filter(Boolean) : [];
  if (!safeImages.length) {
    drawPdfEmptyState(doc, emptyMessage, { fontSize: 10 });
    return;
  }

  const availableWidth = getPageWidth(doc);
  const columnCount = Math.max(1, columns);
  const imageWidth = (availableWidth - gap * (columnCount - 1)) / columnCount;
  const blockHeight = imageHeight + captionHeight;

  for (let index = 0; index < safeImages.length; index += columnCount) {
    const rowImages = safeImages.slice(index, index + columnCount);
    ensurePdfPageSpace(doc, blockHeight + 12);

    const startX = doc.page.margins.left;
    const startY = doc.y;

    rowImages.forEach((image, columnIndex) => {
      const x = startX + columnIndex * (imageWidth + gap);
      const y = startY;

      doc
        .roundedRect(x, y, imageWidth, imageHeight, 8)
        .fillAndStroke("#f8faf8", PDF_THEME.lineSoft);

      try {
        doc.image(image.path, x + 4, y + 4, {
          fit: [imageWidth - 8, imageHeight - 8],
          align: "center",
          valign: "center",
        });
      } catch (error) {
        doc
          .fillColor(PDF_THEME.emptyText)
          .font("Helvetica-Oblique")
          .fontSize(9)
          .text("Image unavailable", x + 10, y + imageHeight / 2 - 6, {
            width: imageWidth - 20,
            align: "center",
          })
          .fillColor(PDF_THEME.text);
      }

      const caption = image.caption || image.label || `Image ${index + columnIndex + 1}`;
      doc
        .fillColor(PDF_THEME.textMuted)
        .font("Helvetica")
        .fontSize(8.5)
        .text(caption, x, y + imageHeight + 6, {
          width: imageWidth,
          align: "center",
        })
        .fillColor(PDF_THEME.text);
    });

    doc.y = startY + blockHeight;
    doc.moveDown(0.3);
  }
};

module.exports = {
  PDF_THEME,
  createPdfDocument,
  drawPdfBulletList,
  drawPdfEmptyState,
  drawPdfFooter,
  drawPdfHeader,
  drawPdfImageGrid,
  drawPdfLabelValue,
  drawPdfParagraphBlock,
  drawPdfSectionTitle,
  drawPdfTable,
  ensurePdfPageSpace,
  formatPdfDateValue,
  getPageWidth,
};
