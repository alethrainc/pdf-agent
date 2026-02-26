import { useState } from 'react';
import styles from '../styles/Home.module.css';

const DEFAULT_LOGO_URL = 'https://plusbrand.com/wp-content/uploads/2025/10/Copia-de-ALETHRA_Logo-scaled.png';
const DEFAULT_FOOTER_MAIN = '© 2026 ALETHRA™. All rights reserved.';
const DEFAULT_FOOTER_SUB = 'Confidential – Not for distribution without written authorization.';
const DEFAULT_STYLE_OPTIONS = {
  titleFontSize: 30,
  headingFontSize: 17,
  bodyFontSize: 11,
  titleFontWeight: 'thin',
};

async function fileToBase64(file) {
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;

  for (let index = 0; index < bytes.length; index += chunk) {
    const slice = bytes.subarray(index, index + chunk);
    binary += String.fromCharCode(...slice);
  }

  return btoa(binary);
}

export default function Home() {
  const [fileName, setFileName] = useState('');
  const [upload, setUpload] = useState(null);
  const [status, setStatus] = useState('');
  const [logoUrl, setLogoUrl] = useState(DEFAULT_LOGO_URL);
  const [footerMain, setFooterMain] = useState(DEFAULT_FOOTER_MAIN);
  const [footerSub, setFooterSub] = useState(DEFAULT_FOOTER_SUB);
  const [busy, setBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [previewText, setPreviewText] = useState('Document Title\n\nSection Heading\nAdjustable body text preview. Update font sizes and weight before generating your PDF.');
  const [styleOptions, setStyleOptions] = useState(DEFAULT_STYLE_OPTIONS);

  function parsePreviewText(file) {
    if (!file) return;

    if (file.type.includes('text') || /\.(txt|html?|rtf)$/i.test(file.name)) {
      file.text().then((text) => {
        if (text) {
          const cleaned = text
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          setPreviewText(cleaned.slice(0, 1200) || previewText);
        }
      });
    }
  }

  function handleFileSelect(file) {
    if (!file) return;

    setUpload(file);
    parsePreviewText(file);
    if (!fileName) {
      const baseName = file.name.replace(/\.[^/.]+$/, '');
      setFileName(baseName);
    }
    setStatus(`Selected file: ${file.name}`);
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragActive(false);
    const dropped = event.dataTransfer.files?.[0];
    handleFileSelect(dropped);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus('');

    if (!upload) {
      setStatus('Drop or upload a file to convert.');
      return;
    }

    setBusy(true);

    try {
      const base64 = await fileToBase64(upload);
      const uploadedFile = {
        name: upload.name,
        mimeType: upload.type || 'application/octet-stream',
        data: base64,
      };

      const response = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName, uploadedFile, logoUrl, footerMain, footerSub, styleOptions }),
      });

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || 'Request failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${fileName || upload.name.replace(/\.[^/.]+$/, '') || 'document'}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);

      setStatus('PDF generated and downloaded successfully.');
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.main}>
      <section className={styles.card}>
        <h1>Upload File → PDF</h1>
        <p>Upload a file and convert it to PDF. Supported: PDF, DOCX, TXT, RTF, HTML. If OPENAI_API_KEY is set, text output is AI-polished for executive formatting. You can edit logo and footer text below.</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <label htmlFor="upload">Upload a file (or drop below)</label>
          <input
            id="upload"
            type="file"
            accept=".pdf,.docx,.txt,.rtf,.html,.htm"
            onChange={(event) => handleFileSelect(event.target.files?.[0])}
            required
          />

          <div
            className={`${styles.dropZone} ${dragActive ? styles.dropZoneActive : ''}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
          >
            {upload ? `Ready to convert: ${upload.name}` : 'Drag & drop a file here'}
          </div>

          <label htmlFor="fileName">Optional output file name</label>
          <input
            id="fileName"
            type="text"
            value={fileName}
            onChange={(event) => setFileName(event.target.value)}
            placeholder="document"
          />


          <label htmlFor="logoUrl">Logo URL (used on each page)</label>
          <input
            id="logoUrl"
            type="url"
            value={logoUrl}
            onChange={(event) => setLogoUrl(event.target.value)}
            placeholder="https://example.com/logo.png"
          />

          <label htmlFor="footerMain">Footer line 1</label>
          <input
            id="footerMain"
            type="text"
            value={footerMain}
            onChange={(event) => setFooterMain(event.target.value)}
          />

          <label htmlFor="footerSub">Footer line 2</label>
          <input
            id="footerSub"
            type="text"
            value={footerSub}
            onChange={(event) => setFooterSub(event.target.value)}
          />

          <div className={styles.styleGrid}>
            <label htmlFor="titleFontSize">Title size</label>
            <input
              id="titleFontSize"
              type="number"
              min="18"
              max="48"
              value={styleOptions.titleFontSize}
              onChange={(event) => setStyleOptions((prev) => ({ ...prev, titleFontSize: Number(event.target.value) || prev.titleFontSize }))}
            />

            <label htmlFor="headingFontSize">Heading size</label>
            <input
              id="headingFontSize"
              type="number"
              min="12"
              max="30"
              value={styleOptions.headingFontSize}
              onChange={(event) => setStyleOptions((prev) => ({ ...prev, headingFontSize: Number(event.target.value) || prev.headingFontSize }))}
            />

            <label htmlFor="bodyFontSize">Body size</label>
            <input
              id="bodyFontSize"
              type="number"
              min="9"
              max="20"
              value={styleOptions.bodyFontSize}
              onChange={(event) => setStyleOptions((prev) => ({ ...prev, bodyFontSize: Number(event.target.value) || prev.bodyFontSize }))}
            />

            <label htmlFor="titleFontWeight">Title weight</label>
            <select
              id="titleFontWeight"
              value={styleOptions.titleFontWeight}
              onChange={(event) => setStyleOptions((prev) => ({ ...prev, titleFontWeight: event.target.value }))}
            >
              <option value="thin">Super thin</option>
              <option value="normal">Normal</option>
            </select>
          </div>

          <button type="submit" disabled={busy}>
            {busy ? 'Generating...' : 'Generate PDF'}
          </button>
        </form>

        <section className={styles.previewCard}>
          <p className={styles.previewLabel}>Live preview</p>
          <div className={styles.previewPage}>
            {logoUrl && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoUrl} alt="Logo preview" className={styles.previewLogo} />
              </>
            )}
            {previewText.split(/\n\n+/).map((paragraph, index) => {
              if (!paragraph.trim()) return null;
              const text = paragraph.trim();
              const first = index === 0;
              const heading = !first && /^[A-Z][A-Za-z0-9'’&:,()\-\s]+$/.test(text) && text.length <= 68;
              const fontSize = first ? styleOptions.titleFontSize : heading ? styleOptions.headingFontSize : styleOptions.bodyFontSize;
              const fontWeight = first ? (styleOptions.titleFontWeight === 'thin' ? 200 : 500) : heading ? 500 : 400;
              return (
                <p
                  key={`${text}-${index}`}
                  style={{
                    fontSize: `${fontSize}px`,
                    lineHeight: first ? 1.3 : heading ? 1.4 : 1.6,
                    fontWeight,
                    textAlign: first ? 'center' : 'left',
                    margin: first ? '10px 0 14px' : '0 0 10px',
                  }}
                >
                  {text}
                </p>
              );
            })}
            <footer className={styles.previewFooter}>
              <span>{footerMain}</span>
              <span>{footerSub}</span>
            </footer>
          </div>
        </section>

        {status && <p className={styles.status}>{status}</p>}
      </section>
    </main>
  );
}
