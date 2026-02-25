import { inflateRawSync } from 'zlib';

const SUPPORTED_EXTENSIONS = new Set(['pdf', 'docx', 'txt', 'rtf', 'html', 'htm']);

function getExtension(fileName = '') {
  return fileName.split('.').pop()?.toLowerCase() || '';
}

function getSafeName(fileName = 'document') {
  const withoutExt = fileName.replace(/\.[^/.]+$/, '');
  return withoutExt.replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '-') || 'document';
}

function decodeXmlEntities(text) {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function htmlToText(html) {
  return decodeXmlEntities(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<li\b[^>]*>/gi, '\n• ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

function rtfToText(rtf) {
  return decodeXmlEntities(
    rtf
      .replace(/\\par[d]?/g, '\n\n')
      .replace(/\\tab/g, '\t')
      .replace(/\\'([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\u(-?\d+)\??/g, (_, code) => String.fromCodePoint(Number(code) < 0 ? 65536 + Number(code) : Number(code)))
      .replace(/\\[a-z]+-?\d* ?/g, '')
      .replace(/[{}]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

function extractZipEntry(buffer, targetName) {
  const eocdSig = 0x06054b50;
  const cdSig = 0x02014b50;
  const localSig = 0x04034b50;

  let eocdOffset = -1;
  const searchStart = Math.max(0, buffer.length - 65557);
  for (let i = buffer.length - 22; i >= searchStart; i -= 1) {
    if (buffer.readUInt32LE(i) === eocdSig) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset < 0) {
    throw new Error('Invalid DOCX file (missing zip directory).');
  }

  const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);
  const centralDirSize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirEnd = centralDirOffset + centralDirSize;

  let ptr = centralDirOffset;
  while (ptr < centralDirEnd) {
    if (buffer.readUInt32LE(ptr) !== cdSig) {
      throw new Error('Invalid DOCX file (corrupt zip entry).');
    }

    const compressionMethod = buffer.readUInt16LE(ptr + 10);
    const compressedSize = buffer.readUInt32LE(ptr + 20);
    const uncompressedSize = buffer.readUInt32LE(ptr + 24);
    const fileNameLength = buffer.readUInt16LE(ptr + 28);
    const extraLength = buffer.readUInt16LE(ptr + 30);
    const commentLength = buffer.readUInt16LE(ptr + 32);
    const localHeaderOffset = buffer.readUInt32LE(ptr + 42);

    const fileNameStart = ptr + 46;
    const fileName = buffer.subarray(fileNameStart, fileNameStart + fileNameLength).toString('utf8');

    if (fileName === targetName) {
      if (buffer.readUInt32LE(localHeaderOffset) !== localSig) {
        throw new Error('Invalid DOCX file (bad local header).');
      }

      const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressedData = buffer.subarray(dataStart, dataStart + compressedSize);

      if (compressionMethod === 0) return compressedData;
      if (compressionMethod === 8) {
        const inflated = inflateRawSync(compressedData);
        if (uncompressedSize && inflated.length !== uncompressedSize) {
          throw new Error('Invalid DOCX file (unexpected decompressed size).');
        }
        return inflated;
      }

      throw new Error('Unsupported DOCX compression method.');
    }

    ptr += 46 + fileNameLength + extraLength + commentLength;
  }

  throw new Error('Invalid DOCX file (word/document.xml not found).');
}

function extractParagraphText(paragraphXml) {
  const runs = paragraphXml.match(/<w:t\b[^>]*>[\s\S]*?<\/w:t>/g) || [];
  const combined = runs
    .map((run) => run.replace(/<w:t\b[^>]*>|<\/w:t>/g, ''))
    .join('')
    .trim();

  return decodeXmlEntities(combined);
}

function docxToText(rawBuffer) {
  const xml = extractZipEntry(rawBuffer, 'word/document.xml').toString('utf8');
  const paragraphs = xml.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];

  const lines = paragraphs
    .map((paragraph) => {
      const isBullet = /<w:numPr\b/.test(paragraph);
      const paragraphText = extractParagraphText(paragraph);
      if (!paragraphText) return '';
      return isBullet ? `• ${paragraphText}` : paragraphText;
    })
    .filter(Boolean);

  return lines.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function formatTextWithAI(text, fileName) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !text) return text;

  const prompt = `Reformat this extracted document text into polished executive formatting while preserving exact meaning and all symbols (including ™, ®, ©).

Rules:
- Preserve headings and hierarchy.
- Preserve numbered lists and bullet lists.
- Keep each bullet on its own line.
- Keep paragraph spacing clear (empty line between paragraphs where appropriate).
- Preserve and improve heading emphasis where appropriate.
- Do not invent facts.
- Output plain text only (no markdown fences).

File: ${fileName || 'uploaded document'}\n\n${text}`;

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        input: prompt,
        temperature: 0.2,
      }),
    });

    if (!response.ok) return text;
    const payload = await response.json();

    const aiText = payload?.output_text?.trim();
    return aiText || text;
  } catch {
    return text;
  }
}

function sanitizeForPdfText(text) {
  return text
    .replace(/[•◦▪●]/g, '• ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/—/g, '—')
    .replace(/–/g, '–')
    .replace(/\u00A0/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
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

function classifyLineStyle(line, contentIndex) {
  const trimmed = line.trim();
  const isFirstLine = contentIndex === 0;
  const isNumberedHeading = /^\d+[\.)]\s+/.test(trimmed);
  const isUpperHeading = trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed) && trimmed.length <= 72;
  const isTitleCaseHeading = /^[A-Z][A-Za-z0-9'’&:,()\-\s]+$/.test(trimmed) && trimmed.length <= 68 && !trimmed.endsWith('.');

  if (isFirstLine) {
    return { font: 'F2', size: 22, lineHeight: 30, color: '0.12 0.12 0.14' };
  }

  if (isNumberedHeading || isUpperHeading || isTitleCaseHeading) {
    return { font: 'F2', size: 15, lineHeight: 22, color: '0.12 0.12 0.14' };
  }

  return { font: 'F1', size: 11, lineHeight: 18, color: '0.22 0.22 0.24' };
}

function buildLineCommand(line, x, y, style) {
  return `${style.color} rg BT /${style.font} ${style.size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${escapePdfText(line)}) Tj ET`;
}

function buildPageDecorationCommands(pageNumber, totalPages, pageWidth, pageHeight) {
  const leftRailWidth = 22;
  const footerY = 28;
  const footerMain = '© 2026 ALETHRA™. All rights reserved.';
  const footerSub = 'Confidential – Not for distribution without written authorization.';
  const pageLabel = `Page ${pageNumber} of ${totalPages}`;

  return [
    'q',
    '0.85 0.11 0.16 rg',
    `0 0 ${leftRailWidth} ${pageHeight} re f`,
    'Q',
    buildLineCommand(footerMain, 46, footerY + 10, {
      font: 'F1',
      size: 9,
      color: '0.35 0.35 0.35',
    }),
    buildLineCommand(footerSub, 46, footerY - 7, {
      font: 'F1',
      size: 8,
      color: '0.35 0.35 0.35',
    }),
    buildLineCommand(pageLabel, pageWidth - 90, footerY - 7, {
      font: 'F1',
      size: 8,
      color: '0.35 0.35 0.35',
    }),
  ];
}

function textToPdfBuffer(text) {
  const pageWidth = 612;
  const pageHeight = 792;
  const marginLeft = 72;
  const marginTop = 72;
  const marginBottom = 74;
  const maxChars = 74;
  const paragraphGap = 8;

  const content = sanitizeForPdfText(text);
  const paragraphs = content.split(/\n\n+/).map((paragraph) => paragraph.trimEnd());

  const pages = [];
  let currentPage = [];
  let y = pageHeight - marginTop;
  let contentIndex = 0;

  const pushNewPage = () => {
    if (currentPage.length) pages.push(currentPage);
    currentPage = [];
    y = pageHeight - marginTop;
  };

  for (let paragraphIndex = 0; paragraphIndex < paragraphs.length; paragraphIndex += 1) {
    const paragraph = paragraphs[paragraphIndex];
    const paragraphLines = (paragraph || ' ').split(/\r?\n/);

    for (const paragraphLine of paragraphLines) {
      const wrapped = wrapLine(paragraphLine || ' ', maxChars);

      for (const line of wrapped) {
        const style = classifyLineStyle(line, contentIndex);
        if (y < marginBottom) pushNewPage();
        currentPage.push(buildLineCommand(line, marginLeft, y, style));
        y -= style.lineHeight;
        contentIndex += 1;
      }
    }

    if (paragraphIndex < paragraphs.length - 1) {
      y -= paragraphGap;
    }
  }

  if (currentPage.length === 0) {
    currentPage.push(buildLineCommand(' ', marginLeft, pageHeight - marginTop, {
      font: 'F1',
      size: 11,
      color: '0.22 0.22 0.24',
    }));
  }

  pages.push(currentPage);

  const objects = [];
  const addObject = (contentObject) => {
    objects.push(contentObject);
    return objects.length;
  };

  const regularFontObjectId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const boldFontObjectId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const pageObjectIds = [];

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const pageLines = pages[pageIndex];
    const decorated = [
      ...buildPageDecorationCommands(pageIndex + 1, pages.length, pageWidth, pageHeight),
      ...pageLines,
    ];

    const stream = decorated.join('\n');
    const contentObjectId = addObject(`<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream`);
    const pageObjectId = addObject(
      `<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${regularFontObjectId} 0 R /F2 ${boldFontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`
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

async function convertUploadedFile(uploadedFile) {
  const rawBuffer = Buffer.from(uploadedFile.data, 'base64');
  const extension = getExtension(uploadedFile.name);

  if (extension === 'pdf') return rawBuffer;

  if (extension === 'docx') {
    const text = await formatTextWithAI(docxToText(rawBuffer), uploadedFile.name);
    return textToPdfBuffer(text);
  }

  if (extension === 'txt') {
    const text = await formatTextWithAI(rawBuffer.toString('utf8'), uploadedFile.name);
    return textToPdfBuffer(text);
  }

  if (extension === 'rtf') {
    const text = await formatTextWithAI(rtfToText(rawBuffer.toString('utf8')), uploadedFile.name);
    return textToPdfBuffer(text);
  }

  if (extension === 'html' || extension === 'htm') {
    const text = await formatTextWithAI(htmlToText(rawBuffer.toString('utf8')), uploadedFile.name);
    return textToPdfBuffer(text);
  }

  throw new Error('Unsupported file type. Upload PDF, DOCX, TXT, RTF, or HTML.');
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
      error: 'Unsupported file type. Upload PDF, DOCX, TXT, RTF, or HTML.',
    });
  }

  try {
    const pdfBuffer = await convertUploadedFile(uploadedFile);
    const safeName = getSafeName(fileName || uploadedFile.name || 'document');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pdf"`);

    return res.status(200).send(pdfBuffer);
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Unable to generate PDF.' });
  }
}
