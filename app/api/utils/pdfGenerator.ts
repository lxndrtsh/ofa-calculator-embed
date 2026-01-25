import { PDFDocument, rgb, StandardFonts, PDFPage } from 'pdf-lib';
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
  opioidRxRate?: number;
  countyRatePer100?: number | null;
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
  state?: string;
  county?: string;
}

// Helper function to check if we need a new page and add one if needed
function ensurePageSpace(
  pdfDoc: PDFDocument,
  currentPage: PDFPage,
  yPos: number,
  requiredSpace: number,
  footerHeight: number = 80
): { page: PDFPage; yPos: number } {
  const { height } = currentPage.getSize();
  const minY = footerHeight;
  
  if (yPos - requiredSpace < minY) {
    // Need a new page
    const newPage = pdfDoc.addPage([612, 792]);
    return { page: newPage, yPos: 792 - 50 }; // Start from top with margin
  }
  
  return { page: currentPage, yPos };
}

// Helper to get default opioid rx rate (20%)
function getDefaultOpioidRxRate(): number {
  return 0.2;
}

// Generate initial PDF matching full-oia results section layout
export async function generateImpactPDFInitial(
  formData: FormData,
  results: ImpactResults,
  countyRate?: number | null
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([612, 792]);
  const { width, height } = page.getSize();

  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const primaryColor = rgb(0.2, 0.2, 0.2); // #333
  const secondaryColor = rgb(0.4, 0.4, 0.4); // #666
  const highlightColor = rgb(0.231, 0.506, 0.969); // #3b82f6
  const borderColor = rgb(0.808, 0.808, 0.808); // #cecece
  const boxBgColor = rgb(0.976, 0.980, 0.984); // #f9fafb
  const lightGray = rgb(0.4, 0.4, 0.4); // #666

  let yPos = height - 50;

  // Logo at top (centered, similar size to web - maxWidth 400px)
  try {
    const logoPath = join(process.cwd(), 'public', 'images', 'OIE.png');
    const logoBytes = await readFile(logoPath);
    const logoImage = await pdfDoc.embedPng(logoBytes);
    // Scale to approximately 400px width (400/612 = 0.65 of page width)
    const logoDims = logoImage.scale(0.65);
    const imageX = (width - logoDims.width) / 2;
    page.drawImage(logoImage, {
      x: imageX,
      y: yPos - logoDims.height,
      width: logoDims.width,
      height: logoDims.height,
    });
    yPos -= logoDims.height + 30;
  } catch (error) {
    console.log('Could not load OIE logo, skipping:', error);
  }

  const leftMargin = 50;
  const rightMargin = width - 50;

  // Heading: "What preventable overprescribing is costing your health plan – right now:"
  const headingText = 'What preventable overprescribing is costing your health plan – right now:';
  const headingSize = 15; // ~1.25rem
  const headingLines = wrapText(headingText, helveticaBoldFont, headingSize, width - (leftMargin * 2));
  
  for (const line of headingLines) {
    const lineWidth = helveticaBoldFont.widthOfTextAtSize(line, headingSize);
    page.drawText(line, {
      x: leftMargin,
      y: yPos,
      size: headingSize,
      font: helveticaBoldFont,
      color: primaryColor,
    });
    yPos -= 20;
  }

  yPos -= 10;

  // Estimated Annual Cost
  const costLabel = 'Estimated Annual Cost';
  const costValue = `$${results.financialImpact.toLocaleString()}`;
  page.drawText(costLabel, {
    x: leftMargin,
    y: yPos,
    size: 15,
    font: helveticaBoldFont,
    color: primaryColor,
  });
  const costValueWidth = helveticaBoldFont.widthOfTextAtSize(costValue, 15);
  page.drawText(costValue, {
    x: rightMargin - costValueWidth,
    y: yPos,
    size: 15,
    font: helveticaBoldFont,
    color: primaryColor,
  });
  yPos -= 30;

  // Members at Elevated Risk
  const riskLabel = 'Members at Elevated Risk:';
  const riskValue = results.atRisk.toLocaleString();
  page.drawText(riskLabel, {
    x: leftMargin,
    y: yPos,
    size: 15,
    font: helveticaBoldFont,
    color: primaryColor,
  });
  const riskValueWidth = helveticaBoldFont.widthOfTextAtSize(riskValue, 15);
  page.drawText(riskValue, {
    x: rightMargin - riskValueWidth,
    y: yPos,
    size: 15,
    font: helveticaBoldFont,
    color: primaryColor,
  });
  yPos -= 40;

  // Text about recoverable spend
  const recoverableText = 'Using a prevention-first strategy, Opioid Free America estimates this amount of recoverable spend – strengthening your plan while protecting lives:';
  const textSize = 12; // ~1rem
  const recoverableLines = wrapText(recoverableText, helveticaFont, textSize, width - (leftMargin * 2));
  
  for (const line of recoverableLines) {
    page.drawText(line, {
      x: leftMargin,
      y: yPos,
      size: textSize,
      font: helveticaFont,
      color: primaryColor,
    });
    yPos -= 18;
  }

  yPos -= 10;

  // Targeted Savings in a box
  const boxPadding = 20;
  const boxHeight = 60;
  const boxWidth = width - (leftMargin * 2);
  const boxY = yPos - boxHeight;

  // Draw box background
  page.drawRectangle({
    x: leftMargin,
    y: boxY,
    width: boxWidth,
    height: boxHeight,
    color: boxBgColor,
    borderColor: highlightColor,
    borderWidth: 2,
  });

  // Targeted Savings value (large, blue)
  const targetedSavingsText = `$${results.targetedSavings.toLocaleString()}`;
  const targetedSavingsSize = 24; // ~2rem
  const targetedSavingsWidth = helveticaBoldFont.widthOfTextAtSize(targetedSavingsText, targetedSavingsSize);
  page.drawText(targetedSavingsText, {
    x: leftMargin + boxPadding,
    y: boxY + boxHeight - 35,
    size: targetedSavingsSize,
    font: helveticaBoldFont,
    color: highlightColor,
  });

  yPos = boxY - 30;

  // County comparison section (if county rate is available)
  if (countyRate !== null && countyRate !== undefined) {
    // Divider line
    page.drawLine({
      start: { x: leftMargin, y: yPos },
      end: { x: rightMargin, y: yPos },
      thickness: 1,
      color: borderColor,
    });
    yPos -= 20;

    // "How your County compares to the national average"
    const compareText = 'How your County compares to the national average';
    page.drawText(compareText, {
      x: leftMargin,
      y: yPos,
      size: textSize,
      font: helveticaFont,
      color: primaryColor,
    });
    yPos -= 25;

    // County comparison box
    const compareBoxHeight = 60;
    const compareBoxY = yPos - compareBoxHeight;
    const compareBoxWidth = width - (leftMargin * 2);
    const compareBoxPadding = 16;

    page.drawRectangle({
      x: leftMargin,
      y: compareBoxY,
      width: compareBoxWidth,
      height: compareBoxHeight,
      color: boxBgColor,
      borderColor: borderColor,
      borderWidth: 1,
    });

    // National Average
    const nationalAvgLabel = 'National Average';
    const nationalAvgValue = `${(getDefaultOpioidRxRate() * 100).toFixed(1)}%`;
    page.drawText(nationalAvgLabel, {
      x: leftMargin + compareBoxPadding,
      y: compareBoxY + compareBoxHeight - 25,
      size: 10.5, // ~0.875rem
      font: helveticaBoldFont,
      color: lightGray,
    });
    page.drawText(nationalAvgValue, {
      x: leftMargin + compareBoxPadding,
      y: compareBoxY + compareBoxHeight - 40,
      size: 13.5, // ~1.125rem
      font: helveticaBoldFont,
      color: primaryColor,
    });

    // Your County
    const yourCountyLabel = 'Your County';
    const yourCountyValue = `${countyRate.toFixed(1)}%`;
    const yourCountyValueWidth = helveticaBoldFont.widthOfTextAtSize(yourCountyValue, 13.5);
    page.drawText(yourCountyLabel, {
      x: rightMargin - compareBoxPadding - yourCountyValueWidth,
      y: compareBoxY + compareBoxHeight - 25,
      size: 10.5,
      font: helveticaBoldFont,
      color: lightGray,
    });
    page.drawText(yourCountyValue, {
      x: rightMargin - compareBoxPadding - yourCountyValueWidth,
      y: compareBoxY + compareBoxHeight - 40,
      size: 13.5,
      font: helveticaBoldFont,
      color: primaryColor,
    });

    yPos = compareBoxY - 20;
  }

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

// Generate expanded PDF (initial layout + all data points in copy:value format)
export async function generateImpactPDFExpanded(
  formData: FormData,
  results: ImpactResults,
  countyRate?: number | null
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([612, 792]);
  const { width, height } = page.getSize();

  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const primaryColor = rgb(0.2, 0.2, 0.2);
  const secondaryColor = rgb(0.4, 0.4, 0.4);
  const highlightColor = rgb(0.231, 0.506, 0.969);
  const borderColor = rgb(0.808, 0.808, 0.808);
  const boxBgColor = rgb(0.976, 0.980, 0.984);
  const lightGray = rgb(0.4, 0.4, 0.4);

  let yPos = height - 50;

  // Logo
  try {
    const logoPath = join(process.cwd(), 'public', 'images', 'OIE.png');
    const logoBytes = await readFile(logoPath);
    const logoImage = await pdfDoc.embedPng(logoBytes);
    const logoDims = logoImage.scale(0.65);
    const imageX = (width - logoDims.width) / 2;
    page.drawImage(logoImage, {
      x: imageX,
      y: yPos - logoDims.height,
      width: logoDims.width,
      height: logoDims.height,
    });
    yPos -= logoDims.height + 30;
  } catch (error) {
    console.log('Could not load OIE logo, skipping:', error);
  }

  const leftMargin = 50;
  const rightMargin = width - 50;
  const lineHeight = 30;
  const textSize = 14;

  // Heading
  const headingText = 'What preventable overprescribing is costing your health plan – right now:';
  const headingSize = 15;
  const headingLines = wrapText(headingText, helveticaBoldFont, headingSize, width - (leftMargin * 2));
  
  for (const line of headingLines) {
    page.drawText(line, {
      x: leftMargin,
      y: yPos,
      size: headingSize,
      font: helveticaBoldFont,
      color: primaryColor,
    });
    yPos -= 20;
  }

  yPos -= 10;

  // Estimated Annual Cost
  const costLabel = 'Estimated Annual Cost';
  const costValue = `$${results.financialImpact.toLocaleString()}`;
  page.drawText(costLabel, {
    x: leftMargin,
    y: yPos,
    size: 15,
    font: helveticaBoldFont,
    color: primaryColor,
  });
  const costValueWidth = helveticaBoldFont.widthOfTextAtSize(costValue, 15);
  page.drawText(costValue, {
    x: rightMargin - costValueWidth,
    y: yPos,
    size: 15,
    font: helveticaBoldFont,
    color: primaryColor,
  });
  yPos -= 30;

  // Members at Elevated Risk
  const riskLabel = 'Members at Elevated Risk:';
  const riskValue = results.atRisk.toLocaleString();
  page.drawText(riskLabel, {
    x: leftMargin,
    y: yPos,
    size: 15,
    font: helveticaBoldFont,
    color: primaryColor,
  });
  const riskValueWidth = helveticaBoldFont.widthOfTextAtSize(riskValue, 15);
  page.drawText(riskValue, {
    x: rightMargin - riskValueWidth,
    y: yPos,
    size: 15,
    font: helveticaBoldFont,
    color: primaryColor,
  });
  yPos -= 40;

  // Text about recoverable spend
  const recoverableText = 'Using a prevention-first strategy, Opioid Free America estimates this amount of recoverable spend – strengthening your plan while protecting lives:';
  const recoverableLines = wrapText(recoverableText, helveticaFont, 12, width - (leftMargin * 2));
  
  for (const line of recoverableLines) {
    page.drawText(line, {
      x: leftMargin,
      y: yPos,
      size: 12,
      font: helveticaFont,
      color: primaryColor,
    });
    yPos -= 18;
  }

  yPos -= 10;

  // Targeted Savings in a box
  const boxPadding = 20;
  const boxHeight = 60;
  const boxWidth = width - (leftMargin * 2);
  const boxY = yPos - boxHeight;

  page.drawRectangle({
    x: leftMargin,
    y: boxY,
    width: boxWidth,
    height: boxHeight,
    color: boxBgColor,
    borderColor: highlightColor,
    borderWidth: 2,
  });

  const targetedSavingsText = `$${results.targetedSavings.toLocaleString()}`;
  const targetedSavingsSize = 24;
  page.drawText(targetedSavingsText, {
    x: leftMargin + boxPadding,
    y: boxY + boxHeight - 35,
    size: targetedSavingsSize,
    font: helveticaBoldFont,
    color: highlightColor,
  });

  yPos = boxY - 30;

  // All data points in copy:value format
  const dataItems = [
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

  // Check if we need a new page before adding data items
  const dataItemsHeight = dataItems.length * lineHeight + 20;
  const checkResult = ensurePageSpace(pdfDoc, page, yPos, dataItemsHeight);
  page = checkResult.page;
  yPos = checkResult.yPos;

  for (const item of dataItems) {
    page.drawText(item.label, {
      x: leftMargin,
      y: yPos,
      size: textSize,
      font: helveticaBoldFont,
      color: primaryColor,
    });

    const valueWidth = helveticaFont.widthOfTextAtSize(item.value, textSize);
    page.drawText(item.value, {
      x: rightMargin - valueWidth,
      y: yPos,
      size: textSize,
      font: helveticaFont,
      color: primaryColor,
    });

    yPos -= lineHeight;
  }

  yPos -= 20;

  // Financial Impact and Targeted Savings in a box
  const financialBoxHeight = 80;
  const financialBoxY = yPos - financialBoxHeight;
  const financialBoxWidth = width - (leftMargin * 2);

  const checkFinancialBox = ensurePageSpace(pdfDoc, page, yPos, financialBoxHeight + 20);
  page = checkFinancialBox.page;
  yPos = checkFinancialBox.yPos;
  const finalFinancialBoxY = yPos - financialBoxHeight;

  page.drawRectangle({
    x: leftMargin,
    y: finalFinancialBoxY,
    width: financialBoxWidth,
    height: financialBoxHeight,
    color: boxBgColor,
    borderColor: highlightColor,
    borderWidth: 2,
  });

  page.drawText('Financial Impact of Opioids:', {
    x: leftMargin + boxPadding,
    y: finalFinancialBoxY + financialBoxHeight - 30,
    size: 16,
    font: helveticaBoldFont,
    color: primaryColor,
  });

  const financialImpactText = `$${results.financialImpact.toLocaleString()}`;
  const financialImpactWidth = helveticaBoldFont.widthOfTextAtSize(financialImpactText, 16);
  page.drawText(financialImpactText, {
    x: rightMargin - financialImpactWidth - boxPadding,
    y: finalFinancialBoxY + financialBoxHeight - 30,
    size: 16,
    font: helveticaBoldFont,
    color: highlightColor,
  });

  page.drawText('Targeted Savings:', {
    x: leftMargin + boxPadding,
    y: finalFinancialBoxY + financialBoxHeight - 55,
    size: 16,
    font: helveticaBoldFont,
    color: primaryColor,
  });

  const targetedSavingsFullText = `$${results.targetedSavings.toLocaleString()} (${results.targetedSavingsPercent}%)`;
  const targetedSavingsFullWidth = helveticaBoldFont.widthOfTextAtSize(targetedSavingsFullText, 16);
  page.drawText(targetedSavingsFullText, {
    x: rightMargin - targetedSavingsFullWidth - boxPadding,
    y: finalFinancialBoxY + financialBoxHeight - 55,
    size: 16,
    font: helveticaBoldFont,
    color: highlightColor,
  });

  yPos = finalFinancialBoxY - 20;

  // County comparison (if available)
  if (countyRate !== null && countyRate !== undefined) {
    page.drawLine({
      start: { x: leftMargin, y: yPos },
      end: { x: rightMargin, y: yPos },
      thickness: 1,
      color: borderColor,
    });
    yPos -= 20;

    const compareText = 'How your County compares to the national average';
    page.drawText(compareText, {
      x: leftMargin,
      y: yPos,
      size: 12,
      font: helveticaFont,
      color: primaryColor,
    });
    yPos -= 25;

    const compareBoxHeight = 60;
    const compareBoxY = yPos - compareBoxHeight;
    const compareBoxWidth = width - (leftMargin * 2);
    const compareBoxPadding = 16;

    page.drawRectangle({
      x: leftMargin,
      y: compareBoxY,
      width: compareBoxWidth,
      height: compareBoxHeight,
      color: boxBgColor,
      borderColor: borderColor,
      borderWidth: 1,
    });

    const nationalAvgLabel = 'National Average';
    const nationalAvgValue = `${(getDefaultOpioidRxRate() * 100).toFixed(1)}%`;
    page.drawText(nationalAvgLabel, {
      x: leftMargin + compareBoxPadding,
      y: compareBoxY + compareBoxHeight - 25,
      size: 10.5,
      font: helveticaBoldFont,
      color: lightGray,
    });
    page.drawText(nationalAvgValue, {
      x: leftMargin + compareBoxPadding,
      y: compareBoxY + compareBoxHeight - 40,
      size: 13.5,
      font: helveticaBoldFont,
      color: primaryColor,
    });

    const yourCountyLabel = 'Your County';
    const yourCountyValue = `${countyRate.toFixed(1)}%`;
    const yourCountyValueWidth = helveticaBoldFont.widthOfTextAtSize(yourCountyValue, 13.5);
    page.drawText(yourCountyLabel, {
      x: rightMargin - compareBoxPadding - yourCountyValueWidth,
      y: compareBoxY + compareBoxHeight - 25,
      size: 10.5,
      font: helveticaBoldFont,
      color: lightGray,
    });
    page.drawText(yourCountyValue, {
      x: rightMargin - compareBoxPadding - yourCountyValueWidth,
      y: compareBoxY + compareBoxHeight - 40,
      size: 13.5,
      font: helveticaBoldFont,
      color: primaryColor,
    });

    yPos = compareBoxY - 20;
  }

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

// Generate full PDF (all copy:value format, logo top, result items in boxes, proper pagination)
export async function generateImpactPDFFull(
  formData: FormData,
  impactResults: ImpactResults,
  communityResults: CommunityResults,
  countyRate?: number | null
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([612, 792]);
  const { width, height } = page.getSize();

  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const primaryColor = rgb(0.2, 0.2, 0.2);
  const secondaryColor = rgb(0.4, 0.4, 0.4);
  const highlightColor = rgb(0.231, 0.506, 0.969);
  const borderColor = rgb(0.898, 0.902, 0.922);
  const boxBgColor = rgb(0.941, 0.976, 1.0);

  let yPos = height - 50;

  // Logo at top
  try {
    const logoPath = join(process.cwd(), 'public', 'images', 'OIE.png');
    const logoBytes = await readFile(logoPath);
    const logoImage = await pdfDoc.embedPng(logoBytes);
    const logoDims = logoImage.scale(0.65);
    const imageX = (width - logoDims.width) / 2;
    page.drawImage(logoImage, {
      x: imageX,
      y: yPos - logoDims.height,
      width: logoDims.width,
      height: logoDims.height,
    });
    yPos -= logoDims.height + 30;
  } catch (error) {
    console.log('Could not load OIE logo, skipping:', error);
  }

  const leftMargin = 50;
  const rightMargin = width - 50;
  const lineHeight = 30;
  const textSize = 14;

  // Impact Analysis Section Title
  page.drawText('Impact Analysis', {
    x: leftMargin,
    y: yPos,
    size: 18,
    font: helveticaBoldFont,
    color: primaryColor,
  });
  yPos -= 30;

  // Impact Analysis data items
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

  // Check if we need a new page for impact items
  const impactItemsHeight = impactItems.length * lineHeight + 20;
  const checkImpact = ensurePageSpace(pdfDoc, page, yPos, impactItemsHeight);
  page = checkImpact.page;
  yPos = checkImpact.yPos;

  for (const item of impactItems) {
    page.drawText(item.label, {
      x: leftMargin,
      y: yPos,
      size: textSize,
      font: helveticaBoldFont,
      color: primaryColor,
    });

    const valueWidth = helveticaFont.widthOfTextAtSize(item.value, textSize);
    page.drawText(item.value, {
      x: rightMargin - valueWidth,
      y: yPos,
      size: textSize,
      font: helveticaFont,
      color: primaryColor,
    });

    yPos -= lineHeight;
  }

  yPos -= 20;

  // Impact Financial Box
  const boxPadding = 20;
  const financialBoxHeight = 80;
  const financialBoxWidth = width - (leftMargin * 2);

  const checkFinancialBox = ensurePageSpace(pdfDoc, page, yPos, financialBoxHeight + 20);
  page = checkFinancialBox.page;
  yPos = checkFinancialBox.yPos;
  const financialBoxY = yPos - financialBoxHeight;

  page.drawRectangle({
    x: leftMargin,
    y: financialBoxY,
    width: financialBoxWidth,
    height: financialBoxHeight,
    color: boxBgColor,
    borderColor: highlightColor,
    borderWidth: 2,
  });

  page.drawText('Financial Impact of Opioids:', {
    x: leftMargin + boxPadding,
    y: financialBoxY + financialBoxHeight - 30,
    size: 16,
    font: helveticaBoldFont,
    color: primaryColor,
  });

  const financialImpactText = `$${impactResults.financialImpact.toLocaleString()}`;
  const financialImpactWidth = helveticaBoldFont.widthOfTextAtSize(financialImpactText, 16);
  page.drawText(financialImpactText, {
    x: rightMargin - financialImpactWidth - boxPadding,
    y: financialBoxY + financialBoxHeight - 30,
    size: 16,
    font: helveticaBoldFont,
    color: highlightColor,
  });

  page.drawText('Targeted Savings:', {
    x: leftMargin + boxPadding,
    y: financialBoxY + financialBoxHeight - 55,
    size: 16,
    font: helveticaBoldFont,
    color: primaryColor,
  });

  const targetedSavingsText = `$${impactResults.targetedSavings.toLocaleString()} (${impactResults.targetedSavingsPercent}%)`;
  const targetedSavingsWidth = helveticaBoldFont.widthOfTextAtSize(targetedSavingsText, 16);
  page.drawText(targetedSavingsText, {
    x: rightMargin - targetedSavingsWidth - boxPadding,
    y: financialBoxY + financialBoxHeight - 55,
    size: 16,
    font: helveticaBoldFont,
    color: highlightColor,
  });

  yPos = financialBoxY - 40;

  // Return on Community Section
  const checkCommunityTitle = ensurePageSpace(pdfDoc, page, yPos, 30);
  page = checkCommunityTitle.page;
  yPos = checkCommunityTitle.yPos;

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

  // Check if we need a new page for community items
  const communityItemsHeight = communityItems.length * lineHeight + 20;
  const checkCommunity = ensurePageSpace(pdfDoc, page, yPos, communityItemsHeight);
  page = checkCommunity.page;
  yPos = checkCommunity.yPos;

  for (const item of communityItems) {
    page.drawText(item.label, {
      x: leftMargin,
      y: yPos,
      size: textSize,
      font: helveticaBoldFont,
      color: primaryColor,
    });

    const valueWidth = helveticaFont.widthOfTextAtSize(item.value, textSize);
    page.drawText(item.value, {
      x: rightMargin - valueWidth,
      y: yPos,
      size: textSize,
      font: helveticaFont,
      color: primaryColor,
    });

    yPos -= lineHeight;
  }

  // Footer on last page
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

// Helper function to wrap text
function wrapText(text: string, font: any, fontSize: number, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);

    if (testWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

// Community PDF generation functions
export async function generateCommunityPDFInitial(
  formData: FormData,
  results: CommunityResults,
  countyRate?: number | null
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([612, 792]);
  const { width, height } = page.getSize();

  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const primaryColor = rgb(0.2, 0.2, 0.2);
  const secondaryColor = rgb(0.4, 0.4, 0.4);
  const highlightColor = rgb(0.231, 0.506, 0.969);
  const borderColor = rgb(0.808, 0.808, 0.808);
  const boxBgColor = rgb(0.976, 0.980, 0.984);
  const lightGray = rgb(0.4, 0.4, 0.4);

  let yPos = height - 50;

  // Logo
  try {
    const logoPath = join(process.cwd(), 'public', 'images', 'OIE.png');
    const logoBytes = await readFile(logoPath);
    const logoImage = await pdfDoc.embedPng(logoBytes);
    const logoDims = logoImage.scale(0.65);
    const imageX = (width - logoDims.width) / 2;
    page.drawImage(logoImage, {
      x: imageX,
      y: yPos - logoDims.height,
      width: logoDims.width,
      height: logoDims.height,
    });
    yPos -= logoDims.height + 30;
  } catch (error) {
    console.log('Could not load OIE logo, skipping:', error);
  }

  const leftMargin = 50;
  const rightMargin = width - 50;

  // Heading
  const headingText = 'Return on Community Impact Analysis';
  const headingSize = 15;
  page.drawText(headingText, {
    x: leftMargin,
    y: yPos,
    size: headingSize,
    font: helveticaBoldFont,
    color: primaryColor,
  });
  yPos -= 30;

  // Total Population
  const popLabel = 'Total Population';
  const popValue = results.population.toLocaleString();
  page.drawText(popLabel, {
    x: leftMargin,
    y: yPos,
    size: 15,
    font: helveticaBoldFont,
    color: primaryColor,
  });
  const popValueWidth = helveticaBoldFont.widthOfTextAtSize(popValue, 15);
  page.drawText(popValue, {
    x: rightMargin - popValueWidth,
    y: yPos,
    size: 15,
    font: helveticaBoldFont,
    color: primaryColor,
  });
  yPos -= 30;

  // Residents with Opioid Rx
  const orxLabel = 'Residents with Opioid Rx';
  const orxValue = results.withORx.toLocaleString();
  page.drawText(orxLabel, {
    x: leftMargin,
    y: yPos,
    size: 15,
    font: helveticaBoldFont,
    color: primaryColor,
  });
  const orxValueWidth = helveticaBoldFont.widthOfTextAtSize(orxValue, 15);
  page.drawText(orxValue, {
    x: rightMargin - orxValueWidth,
    y: yPos,
    size: 15,
    font: helveticaBoldFont,
    color: primaryColor,
  });
  yPos -= 30;

  // At-Risk Residents
  const riskLabel = 'At-Risk Residents';
  const riskValue = results.atRisk.toLocaleString();
  page.drawText(riskLabel, {
    x: leftMargin,
    y: yPos,
    size: 15,
    font: helveticaBoldFont,
    color: primaryColor,
  });
  const riskValueWidth = helveticaBoldFont.widthOfTextAtSize(riskValue, 15);
  page.drawText(riskValue, {
    x: rightMargin - riskValueWidth,
    y: yPos,
    size: 15,
    font: helveticaBoldFont,
    color: primaryColor,
  });
  yPos -= 40;

  // Projected Impact Milestones in a box
  const boxPadding = 20;
  const boxHeight = 100;
  const boxWidth = width - (leftMargin * 2);
  const boxY = yPos - boxHeight;

  page.drawRectangle({
    x: leftMargin,
    y: boxY,
    width: boxWidth,
    height: boxHeight,
    color: boxBgColor,
    borderColor: highlightColor,
    borderWidth: 2,
  });

  page.drawText('Projected Impact Milestones', {
    x: leftMargin + boxPadding,
    y: boxY + boxHeight - 25,
    size: 16,
    font: helveticaBoldFont,
    color: primaryColor,
  });

  page.drawText('Year 2 Milestone: 24% Decrease', {
    x: leftMargin + boxPadding,
    y: boxY + boxHeight - 50,
    size: 12,
    font: helveticaBoldFont,
    color: highlightColor,
  });

  const year2Text = `Potential Reduction: ${results.year2PeopleSaved.toLocaleString()} residents`;
  page.drawText(year2Text, {
    x: leftMargin + boxPadding,
    y: boxY + boxHeight - 65,
    size: 10.5,
    font: helveticaFont,
    color: primaryColor,
  });

  page.drawText('Year 3 Milestone: 35% Decrease', {
    x: leftMargin + boxPadding,
    y: boxY + boxHeight - 85,
    size: 12,
    font: helveticaBoldFont,
    color: highlightColor,
  });

  const year3Text = `Potential Reduction: ${results.year3PeopleSaved.toLocaleString()} residents`;
  page.drawText(year3Text, {
    x: leftMargin + boxPadding,
    y: boxY + boxHeight - 100,
    size: 10.5,
    font: helveticaFont,
    color: primaryColor,
  });

  yPos = boxY - 20;

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

export async function generateCommunityPDFExpanded(
  formData: FormData,
  results: CommunityResults,
  countyRate?: number | null
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([612, 792]);
  const { width, height } = page.getSize();

  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const primaryColor = rgb(0.2, 0.2, 0.2);
  const secondaryColor = rgb(0.4, 0.4, 0.4);
  const highlightColor = rgb(0.231, 0.506, 0.969);
  const borderColor = rgb(0.898, 0.902, 0.922);
  const boxBgColor = rgb(0.941, 0.976, 1.0);

  let yPos = height - 50;

  // Logo
  try {
    const logoPath = join(process.cwd(), 'public', 'images', 'OIE.png');
    const logoBytes = await readFile(logoPath);
    const logoImage = await pdfDoc.embedPng(logoBytes);
    const logoDims = logoImage.scale(0.65);
    const imageX = (width - logoDims.width) / 2;
    page.drawImage(logoImage, {
      x: imageX,
      y: yPos - logoDims.height,
      width: logoDims.width,
      height: logoDims.height,
    });
    yPos -= logoDims.height + 30;
  } catch (error) {
    console.log('Could not load OIE logo, skipping:', error);
  }

  const leftMargin = 50;
  const rightMargin = width - 50;
  const lineHeight = 30;
  const textSize = 14;

  // Heading
  page.drawText('Return on Community', {
    x: leftMargin,
    y: yPos,
    size: 18,
    font: helveticaBoldFont,
    color: primaryColor,
  });
  yPos -= 30;

  // All data points
  const dataItems = [
    { label: 'County Population', value: results.population.toLocaleString() },
    { label: 'Residents with Rx', value: results.withRx.toLocaleString() },
    { label: 'Residents with Opioid Rx', value: results.withORx.toLocaleString() },
    { label: 'At-Risk Residents', value: results.atRisk.toLocaleString() },
    { label: 'Prescribers Identified', value: results.prescribers.toLocaleString() },
    { label: 'Opioid Rx Rate (per 100)', value: results.orxPer100.toFixed(2) },
    { label: 'Year 2 Opioid Rx Rate (per 100)', value: results.year2OrxPer100.toFixed(2) },
    { label: 'Year 3 Opioid Rx Rate (per 100)', value: results.year3OrxPer100.toFixed(2) },
    { label: 'Year 2 People with Opioid Rx', value: results.year2WithORx.toLocaleString() },
    { label: 'Year 3 People with Opioid Rx', value: results.year3WithORx.toLocaleString() },
    { label: 'Year 2 People Potentially Saved', value: results.year2PeopleSaved.toLocaleString() },
    { label: 'Year 3 People Potentially Saved', value: results.year3PeopleSaved.toLocaleString() },
  ];

  const dataItemsHeight = dataItems.length * lineHeight + 20;
  const checkResult = ensurePageSpace(pdfDoc, page, yPos, dataItemsHeight);
  page = checkResult.page;
  yPos = checkResult.yPos;

  for (const item of dataItems) {
    page.drawText(item.label, {
      x: leftMargin,
      y: yPos,
      size: textSize,
      font: helveticaBoldFont,
      color: primaryColor,
    });

    const valueWidth = helveticaFont.widthOfTextAtSize(item.value, textSize);
    page.drawText(item.value, {
      x: rightMargin - valueWidth,
      y: yPos,
      size: textSize,
      font: helveticaFont,
      color: primaryColor,
    });

    yPos -= lineHeight;
  }

  yPos -= 20;

  // Projected Impact Milestones in a box
  const boxPadding = 20;
  const boxHeight = 100;
  const boxWidth = width - (leftMargin * 2);

  const checkBox = ensurePageSpace(pdfDoc, page, yPos, boxHeight + 20);
  page = checkBox.page;
  yPos = checkBox.yPos;
  const boxY = yPos - boxHeight;

  page.drawRectangle({
    x: leftMargin,
    y: boxY,
    width: boxWidth,
    height: boxHeight,
    color: boxBgColor,
    borderColor: highlightColor,
    borderWidth: 2,
  });

  page.drawText('Projected Impact Milestones', {
    x: leftMargin + boxPadding,
    y: boxY + boxHeight - 25,
    size: 16,
    font: helveticaBoldFont,
    color: primaryColor,
  });

  page.drawText('Year 2 Milestone: 24% Decrease', {
    x: leftMargin + boxPadding,
    y: boxY + boxHeight - 50,
    size: 12,
    font: helveticaBoldFont,
    color: highlightColor,
  });

  const year2Text = `Potential Reduction: ${results.year2PeopleSaved.toLocaleString()} residents`;
  page.drawText(year2Text, {
    x: leftMargin + boxPadding,
    y: boxY + boxHeight - 65,
    size: 10.5,
    font: helveticaFont,
    color: primaryColor,
  });

  page.drawText('Year 3 Milestone: 35% Decrease', {
    x: leftMargin + boxPadding,
    y: boxY + boxHeight - 85,
    size: 12,
    font: helveticaBoldFont,
    color: highlightColor,
  });

  const year3Text = `Potential Reduction: ${results.year3PeopleSaved.toLocaleString()} residents`;
  page.drawText(year3Text, {
    x: leftMargin + boxPadding,
    y: boxY + boxHeight - 100,
    size: 10.5,
    font: helveticaFont,
    color: primaryColor,
  });

  yPos = boxY - 20;

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

export async function generateCommunityPDFFull(
  formData: FormData,
  communityResults: CommunityResults,
  impactResults: ImpactResults,
  countyRate?: number | null
): Promise<Buffer> {
  // Full community PDF includes both community and impact data
  return generateImpactPDFFull(formData, impactResults, communityResults, countyRate);
}

// Legacy function for backward compatibility
export async function generateImpactPDF(
  formData: FormData,
  results: ImpactResults
): Promise<Buffer> {
  return generateImpactPDFExpanded(formData, results);
}
