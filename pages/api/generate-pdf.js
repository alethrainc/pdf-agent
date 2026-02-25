import { getDriveClient } from '../../lib/google';

function getDocId(input) {
  if (!input) return null;

  const trimmed = input.trim();
  const docsMatch = trimmed.match(/\/document\/d\/([a-zA-Z0-9-_]+)/);
  if (docsMatch?.[1]) return docsMatch[1];

  return trimmed;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { source, fileName } = req.body || {};
  const docId = getDocId(source);

  if (!docId) {
    return res.status(400).json({
      error: 'Please provide a Google Doc URL or document ID in "source".',
    });
  }

  try {
    const drive = getDriveClient();

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
  }
}
