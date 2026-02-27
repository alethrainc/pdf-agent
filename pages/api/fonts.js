import fs from 'fs/promises';
import path from 'path';

const FONT_EXTENSIONS = new Set(['.ttf', '.otf']);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const fontsDir = path.join(process.cwd(), 'public', 'fonts');

  try {
    const entries = await fs.readdir(fontsDir, { withFileTypes: true });
    const fonts = entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => FONT_EXTENSIONS.has(path.extname(name).toLowerCase()))
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({
        name,
        url: `/fonts/${name}`,
      }));

    return res.status(200).json({ fonts });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(200).json({ fonts: [] });
    }

    return res.status(500).json({ error: 'Unable to load font list.' });
  }
}
