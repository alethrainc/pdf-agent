const SUPPORTED_EXTENSIONS = new Set(['pdf', 'txt', 'rtf', 'html', 'htm']);

function getExtension(fileName = '') {
  return fileName.split('.').pop()?.toLowerCase() || '';
}

function getSafeName(fileName = 'document') {
  const withoutExt = fileName.replace(/\.[^/.]+$/, '');
  return withoutExt.replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '-') || 'document';
}

function htmlToText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function rtfToText(rtf) {
  return rtf
    .replace(/\\par[d]?/g, '\n')
    .replace(/\\'[0-9a-fA-F]{2}/g, '')
    .replace(/\\[a-z]+-?\d* ?/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+\n/g, '\n')
    .trim();
}

function escapePdfText(text) {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrapLine(line, maxChars) {
  if (line.length <= maxChars) return [line];

  const words = line.split(/\s+/);
  const lines = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) lines.push(current);
  return lines;
}

function textToPdfBuffer(text) {
  const pageWidth = 612;
  const pageHeight = 792;
  const marginLeft = 50;
  const marginTop = 50;
  const lineHeight = 16;
  const maxChars = 95;

  const lines = text
    .split(/\r?\n/)
    .flatMap((line) => wrapLine(line || ' ', maxChars))
    .map((line) => escapePdfText(line));

  const pages = [];
  let currentPage = [];
  let y = pageHeight - marginTop;

  for (const line of lines) {
    if (y < 50) {
      pages.push(currentPage);
      currentPage = [];
      y = pageHeight - marginTop;
    }

    currentPage.push(`BT /F1 11 Tf ${marginLeft} ${y} Td (${line}) Tj ET`);
    y -= lineHeight;
  }

  if (currentPage.length === 0) {
    currentPage.push(`BT /F1 11 Tf ${marginLeft} ${pageHeight - marginTop} Td ( ) Tj ET`);
  }
  pages.push(currentPage);

  const objects = [];
  const addObject = (content) => {
    objects.push(content);
    return objects.length;
  };

  const fontObjectId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageObjectIds = [];

  for (const pageLines of pages) {
    const stream = pageLines.join('\n');
    const contentObjectId = addObject(`<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream`);
    const pageObjectId = addObject(
      `<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`
    );
    pageObjectIds.push(pageObjectId);
  }

  const pagesObjectId = addObject(
    `<< /Type /Pages /Count ${pageObjectIds.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] >>`
  );

  for (const pageObjectId of pageObjectIds) {
    objects[pageObjectId - 1] = objects[pageObjectId - 1].replace('/Parent 0 0 R', `/Parent ${pagesObjectId} 0 R`);
  }

  const catalogObjectId = addObject(`<< /Type /Catalog /Pages ${pagesObjectId} 0 R >>`);

  let pdf = '%PDF-1.4\n';
  const offsets = [0];

  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';

  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogObjectId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

function convertUploadedFile(uploadedFile) {
  const rawBuffer = Buffer.from(uploadedFile.data, 'base64');
  const extension = getExtension(uploadedFile.name);

  if (extension === 'pdf') return rawBuffer;
  if (extension === 'txt') return textToPdfBuffer(rawBuffer.toString('utf8'));
  if (extension === 'rtf') return textToPdfBuffer(rtfToText(rawBuffer.toString('utf8')));
  if (extension === 'html' || extension === 'htm') {
    return textToPdfBuffer(htmlToText(rawBuffer.toString('utf8')));
  }

  throw new Error('Unsupported file type. Upload PDF, TXT, RTF, or HTML.');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { fileName, uploadedFile } = req.body || {};

  if (!uploadedFile?.name || !uploadedFile?.data) {
    return res.status(400).json({ error: 'Please upload a file to convert.' });
  }

  const extension = getExtension(uploadedFile.name);
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    return res.status(400).json({
      error: 'Unsupported file type. Upload PDF, TXT, RTF, or HTML.',
    });
  }

  try {
    const pdfBuffer = convertUploadedFile(uploadedFile);
    const safeName = getSafeName(fileName || uploadedFile.name || 'document');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pdf"`);

    return res.status(200).send(pdfBuffer);
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Unable to generate PDF.' });
  }
}
