// ============================================================================
// pdf-generator.js — Generates the SEPA mandate PDF template
// ============================================================================
//
// This module creates a REUSABLE PDF template with:
//   1. AcroForm text fields (firstName, lastName, street, zip, city, birthdate)
//      — These are filled at session creation via inSign's preFilledFields API.
//   2. A ##SIG{...} tag that inSign scans to create a signature field.
//
// The template is generated ONCE on first server startup and saved to disk.
// Every signing session reuses the same template file — user data is injected
// via preFilledFields, not by regenerating the PDF.
//
// To regenerate: delete mandate-template.pdf and restart the server.
//
// Uses PDFKit (https://pdfkit.org/) for PDF generation.
// ============================================================================

const fs = require('fs');
const path = require('path');

// Path where the template PDF is saved (project root)
const TEMPLATE_PATH = path.join(__dirname, '..', 'mandate-template.pdf');

// ============================================================================
// ensureTemplate — Generate the PDF template if it doesn't exist
// ============================================================================
//
// Called on server startup. If the file already exists, does nothing.
// The template contains AcroForm fields that inSign fills via preFilledFields.
//
function ensureTemplate() {
  // Skip if template already exists (delete file to force regeneration)
  if (fs.existsSync(TEMPLATE_PATH)) return;

  // Lazy-load PDFKit (heavy module, ~10s on WSL2)
  const PDFDocument = require('pdfkit');

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 40, bottom: 0, left: 50, right: 50 },
    // bottom: 0 prevents PDFKit from auto-creating extra pages when
    // text gets close to the bottom margin. We position everything manually.
    info: {
      Title: 'SEPA Direct Debit Mandate',
      Author: 'Sig-Funnel Demo',
      Subject: 'SEPA Lastschriftmandat'
    }
  });

  const stream = fs.createWriteStream(TEMPLATE_PATH);
  doc.pipe(stream);

  // Initialize AcroForm support — MUST be called before any formText() calls.
  // Without this, PDFKit throws "Cannot read properties of undefined".
  doc.initForm();

  const pageW = doc.page.width;    // A4 = 595.28 points
  const ml = 50;                    // margin left
  const cw = pageW - ml * 2;       // content width

  // --- Header bar (0.8cm = 23pt top whitespace before the blue banner) ---
  const bannerTop = 23;
  doc.rect(0, bannerTop, pageW, 70).fill('#1a237e');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(20)
    .text('SEPA Direct Debit Mandate', ml, bannerTop + 18, { width: cw, align: 'center' });
  doc.fontSize(9).font('Helvetica')
    .text('Lastschriftmandat', ml, bannerTop + 44, { width: cw, align: 'center' });

  let y = bannerTop + 82;

  // --- Creditor info box ---
  doc.roundedRect(ml, y, cw, 55, 3).lineWidth(0.5).strokeColor('#90caf9').stroke();
  doc.fillColor('#1a237e').font('Helvetica-Bold').fontSize(8)
    .text('CREDITOR', ml + 10, y + 8);
  doc.fillColor('#333').font('Helvetica').fontSize(8);
  doc.text('Demo GmbH  |  ID: DE98ZZZ09999999999  |  Musterstraße 1, 10115 Berlin', ml + 10, y + 22, { width: cw - 20 });
  doc.text('Mandate Ref: Generated per session  |  Template document', ml + 10, y + 36, { width: cw - 20 });

  y += 65;

  // --- Debtor section header ---
  doc.rect(ml, y, cw, 18).fill('#e8eaf6');
  doc.fillColor('#1a237e').font('Helvetica-Bold').fontSize(9)
    .text('DEBTOR / ACCOUNT HOLDER', ml + 10, y + 4);
  y += 26;

  // -----------------------------------------------------------------------
  // AcroForm fields — these are interactive text fields in the PDF.
  // inSign fills them with the values from preFilledFields before the user
  // sees the document. The field `name` must match the preFilledFields `id`.
  // -----------------------------------------------------------------------

  const colW = (cw - 30) / 2;  // column width for two-column layout
  const fieldH = 16;             // height of each form field

  // Helper: render a label + AcroForm text field
  function formField(name, label, x, yy, w) {
    // Static label above the field
    doc.fillColor('#666').font('Helvetica').fontSize(7).text(label, x, yy);
    // Interactive AcroForm text field — inSign fills this via preFilledFields
    // The `name` parameter MUST match the `id` in the preFilledFields array
    doc.formText(name, x, yy + 10, w, fieldH, {
      borderColor: '#bbbbbb',
      backgroundColor: '#f8f9fa',
      fontSize: 9,
      font: 'Helvetica',
      align: 'left'
    });
  }

  // Row 1: First Name + Last Name (two columns)
  formField('firstName', 'First Name', ml + 10, y, colW);       // preFilledFields id: "firstName"
  formField('lastName', 'Last Name', ml + 10 + colW + 10, y, colW); // preFilledFields id: "lastName"
  y += 34;

  // Row 2: Street (full width)
  formField('street', 'Street & House Number', ml + 10, y, cw - 20); // preFilledFields id: "street"
  y += 34;

  // Row 3: ZIP + City (two columns, different widths)
  formField('zip', 'ZIP Code', ml + 10, y, 70);                 // preFilledFields id: "zip"
  formField('city', 'City', ml + 100, y, cw - 120);             // preFilledFields id: "city"
  y += 34;

  // Row 4: Date of Birth
  formField('birthdate', 'Date of Birth', ml + 10, y, 140);     // preFilledFields id: "birthdate"
  y += 38;

  // --- Legal mandate text ---
  doc.rect(ml, y, cw, 1.5).fill('#1a237e');
  y += 8;

  doc.fillColor('#333').font('Helvetica').fontSize(7.5)
    .text(
      'By signing this mandate form, you authorise (A) Demo GmbH to send instructions to your bank to debit your account and (B) your bank to debit your account in accordance with the instructions from Demo GmbH. As part of your rights, you are entitled to a refund from your bank under the terms and conditions of your agreement with your bank. A refund must be claimed within 8 weeks starting from the date on which your account was debited.',
      ml + 10, y, { width: cw - 20, lineGap: 1.5 }
    );
  y += 52;

  doc.fillColor('#333').font('Helvetica-Oblique').fontSize(7)
    .text(
      'Your rights regarding this mandate are subject to the terms and conditions agreed with your bank.',
      ml + 10, y, { width: cw - 20 }
    );
  y += 18;

  // --- Signature area ---
  doc.rect(ml, y, cw, 1.5).fill('#1a237e');
  y += 8;

  doc.fillColor('#1a237e').font('Helvetica-Bold').fontSize(9)
    .text('SIGNATURE', ml + 10, y);
  y += 16;

  doc.fillColor('#666').font('Helvetica').fontSize(7)
    .text('Signature of the account holder', ml + 10, y);
  y += 12;

  // -----------------------------------------------------------------------
  // inSign Signature Tag — ##SIG{...}
  // -----------------------------------------------------------------------
  //
  // When `scanSigTags: true` is set in the session config, inSign scans
  // the PDF text for tags matching the regex: ##SIG\{(?<data>.*?)\}
  //
  // Each tag found is converted into an interactive signature field.
  // The JSON inside the braces configures the field:
  //
  //   x, y   — Offset from the tag's position in the PDF (e.g. "0cm", "-1cm")
  //   w, h   — Width and height of the signature field
  //   role   — Signer role (useful when multiple signers: "Kunde", "Berater")
  //
  // IMPORTANT: The tag must be rendered as a simple text string in the PDF.
  // Do NOT use width/align options in the .text() call — PDFKit may split
  // the text into multiple draw operations, breaking inSign's regex scanner.
  //
  // We render it in white (invisible) at font size 2 so it doesn't show
  // on the printed document but is still extractable as text.
  // -----------------------------------------------------------------------
  const tagText = '##SIG{role:"Kunde",displayname:"Unterschrift Kontoinhaber",x:"0cm",y:"0cm",w:"10cm",h:"2.5cm"}';
  doc.font('Helvetica').fontSize(2).fillColor('#ffffff')
    .text(tagText, ml + 10, y);   // Simple .text(string, x, y) — no width/align!

  // --- Footer ---
  doc.rect(0, doc.page.height - 30, pageW, 30).fill('#f5f5f5');
  doc.fillColor('#999').font('Helvetica').fontSize(6)
    .text('Demo SEPA mandate for testing only.',
      ml, doc.page.height - 20, { width: cw, align: 'center' });

  doc.end();

  // Return a promise that resolves when the file is fully written
  return new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

// ============================================================================
// getTemplateAndFields — Build the preFilledFields array for a user
// ============================================================================
//
// This function maps user data to the inSign preFilledFields format.
// Each entry has:
//   id        — Must match the AcroForm field name in the PDF exactly
//   type      — "text" for text fields
//   text      — The value to prefill (NOT typedText — that's for user input)
//
// These values are sent in the /configure/session request body under
// documents[0].preFilledFields. inSign fills the PDF form fields before
// the user sees the document.
//
function getTemplateAndFields(userData) {
  // IMPORTANT: Use `text` (not `typedText`) to prefill AcroForm fields.
  // `typedText` is for user-typed input; `text` is for server-side prefilling.
  const preFilledFields = [
    { id: 'firstName', type: 'text', text: userData.firstName || '' },
    { id: 'lastName',  type: 'text', text: userData.lastName || '' },
    { id: 'street',    type: 'text', text: userData.street || '' },
    { id: 'zip',       type: 'text', text: userData.zip || '' },
    { id: 'city',      type: 'text', text: userData.city || '' },
    { id: 'birthdate', type: 'text', text: userData.birthdate || '' }
  ];
  return { templatePath: TEMPLATE_PATH, preFilledFields };
}

module.exports = { ensureTemplate, getTemplateAndFields, TEMPLATE_PATH };
