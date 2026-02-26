export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url = req.query?.url;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing logo url.' });
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(400).json({ error: 'Unable to load logo.' });
    }

    const contentType = response.headers.get('content-type') || 'image/png';
    const buffer = Buffer.from(await response.arrayBuffer());

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).send(buffer);
  } catch {
    return res.status(400).json({ error: 'Unable to load logo.' });
  }
}
