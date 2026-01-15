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

interface CommunityResults {
  members: number;
  withRx: number;
  withORx: number;
  atRisk: number;
  prescribers: number;
  orxPer100: number;
  year2OrxPer100: number;
  year3OrxPer100: number;
  year2WithORx: number;
  year3WithORx: number;
  year2PeopleSaved: number;
  year3PeopleSaved: number;
  population: number;
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
    const logoPath = join(process.cwd(), 'public', 'images', 'OIE.png');
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

// Generate simplified initial PDF (just Plan Members, At-Risk Members, Financial Impact, Targeted Savings)
export async function generateImpactPDFInitial(
  formData: FormData,
  results: ImpactResults
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const { width, height } = page.getSize();

  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const primaryColor = rgb(0.2, 0.2, 0.2);
  const secondaryColor = rgb(0.4, 0.4, 0.4);
  const highlightColor = rgb(0.231, 0.506, 0.969);
  const borderColor = rgb(0.898, 0.902, 0.922);
  const boxBgColor = rgb(0.941, 0.976, 1.0);

  let yPos = height - 50;

  // Title
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

  // OIA logo
  try {
    const logoPath = join(process.cwd(), 'public', 'images', 'OIE.png');
    const logoBytes = await readFile(logoPath);
    const logoImage = await pdfDoc.embedPng(logoBytes);
    const logoDims = logoImage.scale(0.3);
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

  yPos -= 40;

  // Simplified Results List (only 2 items)
  const lineHeight = 40;
  const leftMargin = 50;
  const rightMargin = width - 50;

  const resultsItems = [
    { label: 'Plan Members', value: results.members.toLocaleString() },
    { label: 'Identified At-Risk Members', value: results.atRisk.toLocaleString() },
  ];

  resultsItems.forEach((item, index) => {
    page.drawText(item.label, {
      x: leftMargin,
      y: yPos,
      size: 14,
      font: helveticaBoldFont,
      color: primaryColor,
    });

    const valueWidth = helveticaFont.widthOfTextAtSize(item.value, 14);
    page.drawText(item.value, {
      x: rightMargin - valueWidth,
      y: yPos,
      size: 14,
      font: helveticaFont,
      color: primaryColor,
    });

    yPos -= lineHeight;

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

  page.drawRectangle({
    x: leftMargin,
    y: boxY,
    width: boxWidth,
    height: boxHeight,
    color: boxBgColor,
    borderColor: highlightColor,
    borderWidth: 2,
  });

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

  // Footer
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

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

// Generate expanded PDF (all Impact data points) - rename existing function
export async function generateImpactPDFExpanded(
  formData: FormData,
  results: ImpactResults
): Promise<Buffer> {
  return generateImpactPDF(formData, results);
}

// Generate full PDF (expanded Impact + Return on Community data)
export async function generateImpactPDFFull(
  formData: FormData,
  impactResults: ImpactResults,
  communityResults: CommunityResults
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const { width, height } = page.getSize();

  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const primaryColor = rgb(0.2, 0.2, 0.2);
  const secondaryColor = rgb(0.4, 0.4, 0.4);
  const highlightColor = rgb(0.231, 0.506, 0.969);
  const borderColor = rgb(0.898, 0.902, 0.922);
  const boxBgColor = rgb(0.941, 0.976, 1.0);

  let yPos = height - 50;

  // Title
  const titleText = 'Impact Analysis & Return on Community';
  const titleWidth = helveticaBoldFont.widthOfTextAtSize(titleText, 24);
  page.drawText(titleText, {
    x: (width - titleWidth) / 2,
    y: yPos,
    size: 24,
    font: helveticaBoldFont,
    color: primaryColor,
  });

  yPos -= 70;

  // OIA logo
  try {
    const logoPath = join(process.cwd(), 'public', 'images', 'OIE.png');
    const logoBytes = await readFile(logoPath);
    const logoImage = await pdfDoc.embedPng(logoBytes);
    const logoDims = logoImage.scale(0.3);
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

  const lineHeight = 30;
  const leftMargin = 50;
  const rightMargin = width - 50;

  // Impact Analysis Section
  page.drawText('Impact Analysis', {
    x: leftMargin,
    y: yPos,
    size: 18,
    font: helveticaBoldFont,
    color: primaryColor,
  });
  yPos -= 30;

  const impactItems = [
    { label: 'Plan Members', value: impactResults.members.toLocaleString() },
    { label: 'Estimated Members with Rx', value: impactResults.withRx.toLocaleString() },
    { label: 'Estimated Members with Opioid Rx', value: impactResults.withORx.toLocaleString() },
    { label: 'Identified At-Risk Members', value: impactResults.atRisk.toLocaleString() },
    { label: 'Prescribers Identified', value: impactResults.prescribers.toLocaleString() },
    { label: 'Cost/Member with Rx', value: `$${impactResults.costPerMemberORx.toLocaleString()}` },
    { label: 'Net Cost/Member/Orx', value: `$${impactResults.netCostPerMemberORx.toLocaleString()}` },
    {
      label: 'Avg Care Managed Claim Cost',
      value: `$${impactResults.avgCareManagedCost.toLocaleString()} ($${impactResults.savingsPerMember.toLocaleString()} savings)`,
    },
    {
      label: 'Average Medical Claim per Member',
      value: `$${(impactResults.avgClaim || 4000).toLocaleString()}`,
    },
  ];

  impactItems.forEach((item, index) => {
    page.drawText(item.label, {
      x: leftMargin,
      y: yPos,
      size: 14,
      font: helveticaBoldFont,
      color: primaryColor,
    });

    const valueWidth = helveticaFont.widthOfTextAtSize(item.value, 14);
    page.drawText(item.value, {
      x: rightMargin - valueWidth,
      y: yPos,
      size: 14,
      font: helveticaFont,
      color: primaryColor,
    });

    yPos -= lineHeight;

    if (index < impactItems.length - 1) {
      page.drawLine({
        start: { x: leftMargin, y: yPos + 5 },
        end: { x: rightMargin, y: yPos + 5 },
        thickness: 0.5,
        color: borderColor,
      });
    }
  });

  yPos -= 20;

  // Impact Financial Box
  const boxPadding = 20;
  let boxY = yPos - 80;
  const boxHeight = 80;
  const boxWidth = width - (leftMargin * 2);

  page.drawRectangle({
    x: leftMargin,
    y: boxY,
    width: boxWidth,
    height: boxHeight,
    color: boxBgColor,
    borderColor: highlightColor,
    borderWidth: 2,
  });

  page.drawText('Financial Impact of Opioids:', {
    x: leftMargin + boxPadding,
    y: boxY + boxHeight - 30,
    size: 16,
    font: helveticaBoldFont,
    color: primaryColor,
  });

  const financialImpactText = `$${impactResults.financialImpact.toLocaleString()}`;
  const financialImpactWidth = helveticaBoldFont.widthOfTextAtSize(financialImpactText, 16);
  page.drawText(financialImpactText, {
    x: rightMargin - financialImpactWidth - boxPadding,
    y: boxY + boxHeight - 30,
    size: 16,
    font: helveticaBoldFont,
    color: highlightColor,
  });

  page.drawText('Targeted Savings:', {
    x: leftMargin + boxPadding,
    y: boxY + boxHeight - 55,
    size: 16,
    font: helveticaBoldFont,
    color: primaryColor,
  });

  const targetedSavingsText = `$${impactResults.targetedSavings.toLocaleString()} (${impactResults.targetedSavingsPercent}%)`;
  const targetedSavingsWidth = helveticaBoldFont.widthOfTextAtSize(targetedSavingsText, 16);
  page.drawText(targetedSavingsText, {
    x: rightMargin - targetedSavingsWidth - boxPadding,
    y: boxY + boxHeight - 55,
    size: 16,
    font: helveticaBoldFont,
    color: highlightColor,
  });

  yPos = boxY - 40;

  // Return on Community Section
  page.drawText('Return on Community', {
    x: leftMargin,
    y: yPos,
    size: 18,
    font: helveticaBoldFont,
    color: primaryColor,
  });
  yPos -= 30;

  const communityItems = [
    { label: 'County Population', value: communityResults.population.toLocaleString() },
    { label: 'Residents with Rx', value: communityResults.withRx.toLocaleString() },
    { label: 'Residents with Opioid Rx', value: communityResults.withORx.toLocaleString() },
    { label: 'At-Risk Residents', value: communityResults.atRisk.toLocaleString() },
    { label: 'Prescribers Identified', value: communityResults.prescribers.toLocaleString() },
    { label: 'Opioid Rx Rate (per 100)', value: communityResults.orxPer100.toFixed(2) },
    { label: 'Year 2 Opioid Rx Rate (per 100)', value: communityResults.year2OrxPer100.toFixed(2) },
    { label: 'Year 3 Opioid Rx Rate (per 100)', value: communityResults.year3OrxPer100.toFixed(2) },
    { label: 'Year 2 People with Opioid Rx', value: communityResults.year2WithORx.toLocaleString() },
    { label: 'Year 3 People with Opioid Rx', value: communityResults.year3WithORx.toLocaleString() },
    { label: 'Year 2 People Potentially Saved', value: communityResults.year2PeopleSaved.toLocaleString() },
    { label: 'Year 3 People Potentially Saved', value: communityResults.year3PeopleSaved.toLocaleString() },
  ];

  communityItems.forEach((item, index) => {
    page.drawText(item.label, {
      x: leftMargin,
      y: yPos,
      size: 14,
      font: helveticaBoldFont,
      color: primaryColor,
    });

    const valueWidth = helveticaFont.widthOfTextAtSize(item.value, 14);
    page.drawText(item.value, {
      x: rightMargin - valueWidth,
      y: yPos,
      size: 14,
      font: helveticaFont,
      color: primaryColor,
    });

    yPos -= lineHeight;

    if (index < communityItems.length - 1) {
      page.drawLine({
        start: { x: leftMargin, y: yPos + 5 },
        end: { x: rightMargin, y: yPos + 5 },
        thickness: 0.5,
        color: borderColor,
      });
    }
  });

  // Footer
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

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
