import { getDriveClient } from '../../lib/google';

const CONVERTIBLE_MIME_TYPES = new Set([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text',
  'application/rtf',
  'text/rtf',
  'text/plain',
  'text/html',
]);

function getDocId(input) {
  if (!input) return null;

  const trimmed = input.trim();
  const docsMatch = trimmed.match(/\/document\/d\/([a-zA-Z0-9-_]+)/);
  if (docsMatch?.[1]) return docsMatch[1];

  return trimmed;
}

function normalizeMimeType(name, mimeType) {
  if (mimeType && CONVERTIBLE_MIME_TYPES.has(mimeType)) {
    return mimeType;
  }

  const lowered = (name || '').toLowerCase();
  if (lowered.endsWith('.doc')) return 'application/msword';
  if (lowered.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (lowered.endsWith('.odt')) return 'application/vnd.oasis.opendocument.text';
  if (lowered.endsWith('.rtf')) return 'application/rtf';
  if (lowered.endsWith('.txt')) return 'text/plain';
  if (lowered.endsWith('.html') || lowered.endsWith('.htm')) return 'text/html';

  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { source, fileName, uploadedFile } = req.body || {};
  let docId = getDocId(source);
  let uploadedDocId = null;

  if (!docId && !uploadedFile) {
    return res.status(400).json({
      error: 'Please provide a Google Doc URL/ID or upload a supported file.',
    });
  }

  try {
    const drive = getDriveClient();

    if (!docId && uploadedFile) {
      const mimeType = normalizeMimeType(uploadedFile.name, uploadedFile.mimeType);
      if (!mimeType) {
        return res.status(400).json({
          error:
            'Unsupported uploaded file type. Use DOC, DOCX, ODT, RTF, TXT, or HTML.',
        });
      }

      const uploadResponse = await drive.files.create({
        requestBody: {
          name: uploadedFile.name || 'uploaded-document',
          mimeType: 'application/vnd.google-apps.document',
        },
        media: {
          mimeType,
          body: Buffer.from(uploadedFile.data, 'base64'),
        },
        fields: 'id',
      });

      uploadedDocId = uploadResponse.data.id;
      docId = uploadedDocId;
    }

    const metadata = await drive.files.get({
      fileId: docId,
      fields: 'id,name,mimeType',
    });

    if (metadata.data.mimeType !== 'application/vnd.google-apps.document') {
      return res.status(400).json({
        error: 'The provided file is not a Google Docs document.',
      });
    }

    const exportResponse = await drive.files.export(
      {
        fileId: docId,
        mimeType: 'application/pdf',
      },
      { responseType: 'arraybuffer' }
    );

    const safeName = (fileName || metadata.data.name || 'document')
      .replace(/[^a-zA-Z0-9-_ ]/g, '')
      .trim()
      .replace(/\s+/g, '-');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeName || 'document'}.pdf"`
    );

    return res.status(200).send(Buffer.from(exportResponse.data));
  } catch (error) {
    const message =
      error?.response?.data?.error?.message ||
      error?.message ||
      'Unable to generate PDF.';

    return res.status(500).json({ error: message });
  } finally {
    if (uploadedDocId) {
      try {
        const drive = getDriveClient();
        await drive.files.delete({ fileId: uploadedDocId });
      } catch {
        // Ignore cleanup errors.
      }
    }
  }
}
