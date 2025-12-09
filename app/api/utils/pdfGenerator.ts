import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { join } from 'path';
import { readFile } from 'fs/promises';

interface ImpactResults {
  members: number;
  withRx: number;
  withORx: number;
  atRisk: number;
  prescribers: number;
  costPerMemberORx: number;
  netCostPerMemberORx: number;
  avgCareManagedCost: number;
  savingsPerMember: number;
  financialImpact: number;
  targetedSavings: number;
  targetedSavingsPercent: number;
  avgClaim?: number;
}

interface FormData {
  company: string;
  firstName: string;
  lastName: string;
  email: string;
}

export async function generateImpactPDF(
  formData: FormData,
  results: ImpactResults
): Promise<Buffer> {
  // Create a new PDF document
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // Letter size in points
  const { width, height } = page.getSize();

  // Load fonts
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Colors
  const primaryColor = rgb(0.2, 0.2, 0.2); // #333333
  const secondaryColor = rgb(0.4, 0.4, 0.4); // #666666
  const highlightColor = rgb(0.231, 0.506, 0.969); // #3b82f6
  const borderColor = rgb(0.898, 0.902, 0.922); // #e5e7eb
  const boxBgColor = rgb(0.941, 0.976, 1.0); // #f0f9ff

  let yPos = height - 50; // Start from top with margin

  // Title - centered
  const titleText = 'Impact Analysis';
  const titleWidth = helveticaBoldFont.widthOfTextAtSize(titleText, 24);
  page.drawText(titleText, {
    x: (width - titleWidth) / 2,
    y: yPos,
    size: 24,
    font: helveticaBoldFont,
    color: primaryColor,
  });

  yPos -= 70;

  // Try to load and add OIA logo (if it exists)
  try {
    const logoPath = join(process.cwd(), 'public', 'images', 'OIA.png');
    const logoBytes = await readFile(logoPath);
    const logoImage = await pdfDoc.embedPng(logoBytes);
    const logoDims = logoImage.scale(0.3); // Scale down
    const imageX = (width - logoDims.width) / 2;
    page.drawImage(logoImage, {
      x: imageX,
      y: yPos - logoDims.height,
      width: logoDims.width,
      height: logoDims.height,
    });
    yPos -= logoDims.height + 20;
  } catch (error) {
    console.log('Could not load OIA logo, skipping:', error);
  }

  yPos -= 20;

  // Results List
  const lineHeight = 30;
  const leftMargin = 50;
  const rightMargin = width - 50;

  const resultsItems = [
    { label: 'Plan Members', value: results.members.toLocaleString() },
    { label: 'Estimated Members with Rx', value: results.withRx.toLocaleString() },
    { label: 'Estimated Members with Opioid Rx', value: results.withORx.toLocaleString() },
    { label: 'Identified At-Risk Members', value: results.atRisk.toLocaleString() },
    { label: 'Prescribers Identified', value: results.prescribers.toLocaleString() },
    { label: 'Cost/Member with Rx', value: `$${results.costPerMemberORx.toLocaleString()}` },
    { label: 'Net Cost/Member/Orx', value: `$${results.netCostPerMemberORx.toLocaleString()}` },
    {
      label: 'Avg Care Managed Claim Cost',
      value: `$${results.avgCareManagedCost.toLocaleString()} ($${results.savingsPerMember.toLocaleString()} savings)`,
    },
    {
      label: 'Average Medical Claim per Member',
      value: `$${(results.avgClaim || 4000).toLocaleString()}`,
    },
  ];

  resultsItems.forEach((item, index) => {
    // Label (bold, left)
    page.drawText(item.label, {
      x: leftMargin,
      y: yPos,
      size: 14,
      font: helveticaBoldFont,
      color: primaryColor,
    });

    // Value (normal, right)
    const valueWidth = helveticaFont.widthOfTextAtSize(item.value, 14);
    page.drawText(item.value, {
      x: rightMargin - valueWidth,
      y: yPos,
      size: 14,
      font: helveticaFont,
      color: primaryColor,
    });

    yPos -= lineHeight;

    // Draw divider line
    if (index < resultsItems.length - 1) {
      page.drawLine({
        start: { x: leftMargin, y: yPos + 5 },
        end: { x: rightMargin, y: yPos + 5 },
        thickness: 0.5,
        color: borderColor,
      });
    }
  });

  yPos -= 30;

  // Final Values - Highlighted Box
  const boxPadding = 20;
  const boxY = yPos - 80;
  const boxHeight = 80;
  const boxWidth = width - (leftMargin * 2);

  // Draw highlighted box background
  page.drawRectangle({
    x: leftMargin,
    y: boxY,
    width: boxWidth,
    height: boxHeight,
    color: boxBgColor,
    borderColor: highlightColor,
    borderWidth: 2,
  });

  // Financial Impact
  page.drawText('Financial Impact of Opioids:', {
    x: leftMargin + boxPadding,
    y: boxY + boxHeight - 30,
    size: 16,
    font: helveticaBoldFont,
    color: primaryColor,
  });

  const financialImpactText = `$${results.financialImpact.toLocaleString()}`;
  const financialImpactWidth = helveticaBoldFont.widthOfTextAtSize(financialImpactText, 16);
  page.drawText(financialImpactText, {
    x: rightMargin - financialImpactWidth - boxPadding,
    y: boxY + boxHeight - 30,
    size: 16,
    font: helveticaBoldFont,
    color: highlightColor,
  });

  // Targeted Savings
  page.drawText('Targeted Savings:', {
    x: leftMargin + boxPadding,
    y: boxY + boxHeight - 55,
    size: 16,
    font: helveticaBoldFont,
    color: primaryColor,
  });

  const targetedSavingsText = `$${results.targetedSavings.toLocaleString()} (${results.targetedSavingsPercent}%)`;
  const targetedSavingsWidth = helveticaBoldFont.widthOfTextAtSize(targetedSavingsText, 16);
  page.drawText(targetedSavingsText, {
    x: rightMargin - targetedSavingsWidth - boxPadding,
    y: boxY + boxHeight - 55,
    size: 16,
    font: helveticaBoldFont,
    color: highlightColor,
  });

  yPos = boxY - 30;

  // Company/Contact Info at bottom
  const footerY = 50;
  page.drawText(`Generated for: ${formData.company}`, {
    x: leftMargin,
    y: footerY + 30,
    size: 10,
    font: helveticaFont,
    color: secondaryColor,
  });
  page.drawText(`Contact: ${formData.firstName} ${formData.lastName} (${formData.email})`, {
    x: leftMargin,
    y: footerY + 15,
    size: 10,
    font: helveticaFont,
    color: secondaryColor,
  });
  page.drawText(`Generated on: ${new Date().toLocaleDateString()}`, {
    x: leftMargin,
    y: footerY,
    size: 10,
    font: helveticaFont,
    color: secondaryColor,
  });

  // Serialize the PDF to bytes
  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
