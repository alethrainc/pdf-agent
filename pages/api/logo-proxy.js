export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.query || {};
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing logo URL.' });
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(400).json({ error: 'Unable to fetch logo image.' });
    }

    const contentType = response.headers.get('content-type') || 'image/png';
    const imageBuffer = Buffer.from(await response.arrayBuffer());

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).send(imageBuffer);
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Unable to fetch logo image.' });
  }
}
