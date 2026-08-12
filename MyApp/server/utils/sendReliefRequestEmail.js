const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const ReliefRequest = require("../models/ReliefRequest");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  connectionTimeout: 30000,
  greetingTimeout: 30000,
  socketTimeout: 30000,
});

function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function safeText(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function formatDateTime(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateOnly(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function drawLabelValue(doc, label, value, x, y, labelWidth = 120, valueWidth = 360) {
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .text(label, x, y, {
      width: labelWidth,
      lineBreak: false,
    });

  doc
    .font("Helvetica")
    .fontSize(10)
    .text(value || "-", x + labelWidth, y, {
      width: valueWidth,
    });
}

function drawTableHeader(doc, y) {
  const startX = doc.page.margins?.left || 40;
  const contentWidth =
    doc.page.width -
    (doc.page.margins?.left || 40) -
    (doc.page.margins?.right || 40);

  const baseColumns = [
    { key: "no", label: "No.", width: 28, align: "center" },
    { key: "evacuationCenterName", label: "Evacuation Center", width: 145, align: "left" },
    { key: "households", label: "Households", width: 55, align: "center" },
    { key: "families", label: "Families", width: 50, align: "center" },
    { key: "male", label: "Male", width: 42, align: "center" },
    { key: "female", label: "Female", width: 45, align: "center" },
    { key: "lgbtq", label: "LGBTQ", width: 45, align: "center" },
    { key: "pwd", label: "PWD", width: 38, align: "center" },
    { key: "pregnant", label: "Preg.", width: 44, align: "center" },
    { key: "senior", label: "Senior", width: 44, align: "center" },
    { key: "requestedFoodPacks", label: "Food Packs", width: 60, align: "center" },
  ];
  const baseTotalWidth = baseColumns.reduce((sum, col) => sum + col.width, 0);
  const scale = Math.min(1, contentWidth / baseTotalWidth);
  const columns = baseColumns.map((col, index) => ({
    ...col,
    width:
      index === baseColumns.length - 1
        ? contentWidth -
          baseColumns
            .slice(0, -1)
            .reduce((sum, item) => sum + Math.floor(item.width * scale), 0)
        : Math.floor(col.width * scale),
  }));

  let x = startX;
  columns.forEach((col) => {
    col.x = x;
    x += col.width;
  });

  const totalWidth = columns.reduce((sum, col) => sum + col.width, 0);
  const rowHeight = 24;

  doc.rect(startX, y, totalWidth, rowHeight).stroke();

  columns.forEach((col) => {
    doc.moveTo(col.x, y).lineTo(col.x, y + rowHeight).stroke();
  });
  doc.moveTo(startX + totalWidth, y).lineTo(startX + totalWidth, y + rowHeight).stroke();

  doc.font("Helvetica-Bold").fontSize(8);

  columns.forEach((col) => {
    doc.text(col.label, col.x + 2, y + 7, {
      width: col.width - 4,
      align: col.align,
      height: rowHeight - 8,
      ellipsis: true,
      lineBreak: false,
    });
  });

  return { columns, rowHeight, totalWidth, startX };
}

function drawTableRow(doc, row, index, y, tableMeta) {
  const { columns, totalWidth, startX } = tableMeta;

  const values = {
    no: String(index + 1),
    evacuationCenterName: safeText(row.evacuationCenterName) || "-",
    households: String(Number(row.households) || 0),
    families: String(Number(row.families) || 0),
    male: String(Number(row.male) || 0),
    female: String(Number(row.female) || 0),
    lgbtq: String(Number(row.lgbtq) || 0),
    pwd: String(Number(row.pwd) || 0),
    pregnant: String(Number(row.pregnant) || 0),
    senior: String(Number(row.senior) || 0),
    requestedFoodPacks: String(Number(row.requestedFoodPacks) || 0),
  };

  const rowHeight = 24;

  doc.rect(startX, y, totalWidth, rowHeight).stroke();

  columns.forEach((col) => {
    doc.moveTo(col.x, y).lineTo(col.x, y + rowHeight).stroke();
  });
  doc.moveTo(startX + totalWidth, y).lineTo(startX + totalWidth, y + rowHeight).stroke();

  doc.font("Helvetica").fontSize(8.5);

  columns.forEach((col) => {
    doc.text(values[col.key], col.x + 2, y + 7, {
      width: col.width - 4,
      align: col.align,
      height: rowHeight - 8,
      ellipsis: true,
    });
  });

  return rowHeight;
}

function addPdfHeader(doc, request, isContinuation = false) {
  const pageWidth = doc.page.width;
  const left = 40;
  const right = 40;
  const contentWidth = pageWidth - left - right;

  let y = 36;

  doc
    .font("Helvetica-Bold")
    .fontSize(18)
    .text("MUNICIPAL DISASTER RISK REDUCTION AND MANAGEMENT OFFICE", left, y, {
      width: contentWidth,
      align: "center",
    });

  y = doc.y + 6;

  doc
    .font("Helvetica")
    .fontSize(10.5)
    .text(
      isContinuation
        ? "Relief Assistance Request Report (Continued)"
        : "Relief Assistance Request Report",
      left,
      y,
      {
        width: contentWidth,
        align: "center",
      }
    );

  y = doc.y + 10;

  doc.moveTo(left, y).lineTo(pageWidth - right, y).stroke();

  y += 18;

  drawLabelValue(doc, "Request No:", safeText(request.requestNo), left, y);
  y += 20;

  drawLabelValue(doc, "Barangay:", safeText(request.barangayName), left, y);
  y += 20;

  drawLabelValue(doc, "Disaster:", safeText(request.disaster), left, y);
  y += 20;

  drawLabelValue(doc, "Request Date:", formatDateTime(request.requestDate), left, y);
  y += 20;

  drawLabelValue(doc, "Status:", safeText(request.status), left, y);
  y += 20;

  drawLabelValue(doc, "Remarks:", safeText(request.remarks) || "-", left, y, 120, 390);
  y = doc.y + 16;

  return y;
}

function addPdfFooter(doc) {
  const footerY = doc.page.height - 55;
  const left = 40;
  const contentWidth = doc.page.width - 80;

  doc
    .font("Helvetica-Oblique")
    .fontSize(8)
    .fillColor("#555")
    .text("System Generated Document", left, footerY, {
      width: contentWidth,
      align: "center",
    });

  doc.fillColor("black");
}

function generateReliefRequestPdf(request) {
  return new Promise((resolve, reject) => {
    try {
      const uploadDir = path.join(__dirname, "../uploads/relief-requests");
      ensureDirectoryExists(uploadDir);

      const fileName = `${request.requestNo}.pdf`;
      const absoluteFilePath = path.join(uploadDir, fileName);
      const relativeFilePath = `/uploads/relief-requests/${fileName}`;

      const doc = new PDFDocument({
        size: "A4",
        layout: "landscape",
        margin: 40,
      });

      const stream = fs.createWriteStream(absoluteFilePath);
      doc.pipe(stream);

      let y = addPdfHeader(doc, request, false);

      doc
        .font("Helvetica-Bold")
        .fontSize(11.5)
        .text("Evacuation Details", 40, y);

      y += 20;

      let tableMeta = drawTableHeader(doc, y);
      y += tableMeta.rowHeight;

      const bottomLimit = doc.page.height - 90;

      (request.rows || []).forEach((row, index) => {
        if (y + 24 > bottomLimit) {
          addPdfFooter(doc);
          doc.addPage();
          y = addPdfHeader(doc, request, true);

          doc
            .font("Helvetica-Bold")
            .fontSize(11.5)
            .text("Evacuation Details", 40, y);

          y += 20;
          tableMeta = drawTableHeader(doc, y);
          y += tableMeta.rowHeight;
        }

        y += drawTableRow(doc, row, index, y, tableMeta);
      });

      y += 22;

      const totals = request.totals || {};

      if (y + 90 > bottomLimit) {
        addPdfFooter(doc);
        doc.addPage();
        y = addPdfHeader(doc, request, true);
      }

      doc
        .font("Helvetica-Bold")
        .fontSize(11.5)
        .text("Totals Summary", 40, y);

      y += 18;

      doc.font("Helvetica").fontSize(10);

      doc.text(`Households: ${Number(totals.households) || 0}`, 40, y, { width: 160 });
      doc.text(`Families: ${Number(totals.families) || 0}`, 215, y, { width: 160 });
      doc.text(`Male: ${Number(totals.male) || 0}`, 390, y, { width: 150 });
      y += 18;

      doc.text(`Female: ${Number(totals.female) || 0}`, 40, y, { width: 160 });
      doc.text(`LGBTQ: ${Number(totals.lgbtq) || 0}`, 215, y, { width: 160 });
      doc.text(`PWD: ${Number(totals.pwd) || 0}`, 390, y, { width: 150 });
      y += 18;

      doc.text(`Pregnant: ${Number(totals.pregnant) || 0}`, 40, y, { width: 160 });
      doc.text(`Senior: ${Number(totals.senior) || 0}`, 215, y, { width: 160 });
      doc.text(`Requested Food Packs: ${Number(totals.requestedFoodPacks) || 0}`, 390, y, {
        width: 150,
      });

      addPdfFooter(doc);
      doc.end();

      stream.on("finish", () => {
        resolve({
          absoluteFilePath,
          relativeFilePath,
        });
      });

      stream.on("error", reject);
    } catch (error) {
      reject(error);
    }
  });
}

const sendReliefRequestEmail = async (request) => {
  const recipients = String(process.env.DRRMO_EMAIL || "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);

  if (!recipients.length) {
    throw new Error("No DRRMO_EMAIL recipients found in environment variables.");
  }

  console.log("EMAIL_USER:", process.env.EMAIL_USER);
  console.log("Sending relief request email to:", recipients);

  const rowsHtml = (request.rows || [])
    .map(
      (row, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${safeText(row.evacuationCenterName) || "-"}</td>
          <td>${Number(row.households) || 0}</td>
          <td>${Number(row.families) || 0}</td>
          <td>${Number(row.male) || 0}</td>
          <td>${Number(row.female) || 0}</td>
          <td>${Number(row.lgbtq) || 0}</td>
          <td>${Number(row.pwd) || 0}</td>
          <td>${Number(row.pregnant) || 0}</td>
          <td>${Number(row.senior) || 0}</td>
          <td>${Number(row.requestedFoodPacks) || 0}</td>
        </tr>
      `
    )
    .join("");

  let pdfResult;

  try {
    pdfResult = await generateReliefRequestPdf(request);
  } catch (err) {
    console.error("PDF generation failed:", err);
    throw new Error("Failed to generate relief request PDF.");
  }

  await ReliefRequest.findByIdAndUpdate(request._id, {
    pdfFile: pdfResult.relativeFilePath,
    pdfGeneratedAt: new Date(),
    emailSent: true,
  });

  await transporter.sendMail({
    from: `"MDRRMO Relief Request System" <${process.env.EMAIL_USER}>`,
    to: recipients,
    subject: `New Relief Request - ${request.requestNo}`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #222; line-height: 1.5;">
        <h2 style="margin-bottom: 12px;">New Relief Request Submitted</h2>

        <p><strong>Request No:</strong> ${safeText(request.requestNo)}</p>
        <p><strong>Barangay:</strong> ${safeText(request.barangayName)}</p>
        <p><strong>Disaster:</strong> ${safeText(request.disaster)}</p>
        <p><strong>Date:</strong> ${formatDateOnly(request.requestDate)}</p>
        <p><strong>Status:</strong> ${safeText(request.status) || "-"}</p>
        <p><strong>Remarks:</strong> ${safeText(request.remarks) || "-"}</p>

        <h3 style="margin-top: 24px; margin-bottom: 10px;">Evacuation Details</h3>
        <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; width: 100%; font-size: 14px;">
          <thead style="background: #f3f4f6;">
            <tr>
              <th>No.</th>
              <th>Evacuation Center</th>
              <th>Households</th>
              <th>Families</th>
              <th>Male</th>
              <th>Female</th>
              <th>LGBTQ</th>
              <th>PWD</th>
              <th>Pregnant</th>
              <th>Senior</th>
              <th>Requested Food Packs</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <h3 style="margin-top: 24px; margin-bottom: 10px;">Totals Summary</h3>
        <ul>
          <li>Households: ${Number(request.totals?.households) || 0}</li>
          <li>Families: ${Number(request.totals?.families) || 0}</li>
          <li>Male: ${Number(request.totals?.male) || 0}</li>
          <li>Female: ${Number(request.totals?.female) || 0}</li>
          <li>LGBTQ: ${Number(request.totals?.lgbtq) || 0}</li>
          <li>PWD: ${Number(request.totals?.pwd) || 0}</li>
          <li>Pregnant: ${Number(request.totals?.pregnant) || 0}</li>
          <li>Senior: ${Number(request.totals?.senior) || 0}</li>
          <li>Requested Food Packs: ${Number(request.totals?.requestedFoodPacks) || 0}</li>
        </ul>

        <p style="margin-top: 20px;">
          <strong>Attached:</strong> PDF copy of the relief request
        </p>
      </div>
    `,
    attachments: [
      {
        filename: `${request.requestNo}.pdf`,
        path: pdfResult.absoluteFilePath,
        contentType: "application/pdf",
      },
    ],
  });
};

module.exports = sendReliefRequestEmail;
