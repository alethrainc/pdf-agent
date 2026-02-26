import { inflateRawSync } from 'zlib';

const SUPPORTED_EXTENSIONS = new Set(['docx', 'txt', 'rtf', 'html', 'htm']);

function getExtension(fileName = '') {
  return fileName.split('.').pop()?.toLowerCase() || '';
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
      .replace(/<h[1-6]\b[^>]*>/gi, '\n\n')
      .replace(/<\/h[1-6]>/gi, '\n\n')
      .replace(/<li\b[^>]*>/gi, '\n• ')
      .replace(/<\/(p|div|section|article|ul|ol)>/gi, '\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
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

function sanitizeText(text) {
  return text.replace(/\u00A0/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function inferBlockRole(paragraph, index) {
  const trimmed = paragraph.trim();
  if (!trimmed) return 'body';
  if (index === 0) return 'title';

  const isNumberedHeading = /^\d+[\.)]\s+/.test(trimmed);
  const isUpperHeading = trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed) && trimmed.length <= 72;
  const isTitleCaseHeading = /^[A-Z][A-Za-z0-9'’&:,()\-\s]+$/.test(trimmed) && trimmed.length <= 68 && !trimmed.endsWith('.');
  return isNumberedHeading || isUpperHeading || isTitleCaseHeading ? 'heading' : 'body';
}

function textToCodedDocument(text) {
  const paragraphs = sanitizeText(text).split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  const blocks = paragraphs.map((paragraph, index) => ({
    role: inferBlockRole(paragraph, index),
    text: paragraph,
  }));

  if (!blocks.length) return { blocks: [{ role: 'body', text: ' ' }] };
  return { blocks: applyAlethraLayoutHeuristics(blocks) };
}

function applyAlethraLayoutHeuristics(blocks) {
  const normalized = blocks
    .map((block) => ({ ...block, text: block.text.trim() }))
    .filter((block) => block.text);

  if (!normalized.length) return [{ role: 'body', text: ' ' }];

  const firstBlock = normalized[0];
  const secondBlock = normalized[1];
  const hasAlethraStandaloneTop = firstBlock?.text?.toLowerCase() === 'alethra' && secondBlock?.text;

  const remapped = hasAlethraStandaloneTop
    ? [{ role: 'title', text: `${firstBlock.text}\n${secondBlock.text}` }, ...normalized.slice(2)]
    : normalized;

  return remapped.map((block, index) => {
    if (block.role !== 'body') return block;
    const likelyFrontMatter = index <= 3;
    const isConfidentialNotice = /\bconfidential\b/i.test(block.text);
    if (likelyFrontMatter && isConfidentialNotice) {
      return { ...block, role: 'centeredBody' };
    }
    return block;
  });
}

function extractText(uploadedFile) {
  const rawBuffer = Buffer.from(uploadedFile.data, 'base64');
  const extension = getExtension(uploadedFile.name);

  if (extension === 'docx') return docxToText(rawBuffer);
  if (extension === 'txt') return rawBuffer.toString('utf8');
  if (extension === 'rtf') return rtfToText(rawBuffer.toString('utf8'));
  if (extension === 'html' || extension === 'htm') return htmlToText(rawBuffer.toString('utf8'));
  throw new Error('Preview is available for DOCX, TXT, RTF, and HTML files.');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { uploadedFile } = req.body || {};
  if (!uploadedFile?.name || !uploadedFile?.data) {
    return res.status(400).json({ error: 'Please upload a file to preview.' });
  }

  const extension = getExtension(uploadedFile.name);
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    return res.status(400).json({ error: 'Live preview is available for DOCX, TXT, RTF, and HTML files.' });
  }

  try {
    const previewText = extractText(uploadedFile);
    return res.status(200).json({ codedDocument: textToCodedDocument(previewText) });
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Unable to build preview.' });
  }
}
