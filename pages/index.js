import { useRef, useState } from 'react';
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



function loadScriptOnce(src, globalName) {
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window[globalName]) {
      resolve(window[globalName]);
      return;
    }

    const existing = document.querySelector(`script[data-src="${src}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(window[globalName]));
      existing.addEventListener('error', () => reject(new Error(`Unable to load ${globalName}.`)));
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.src = src;
    script.onload = () => resolve(window[globalName]);
    script.onerror = () => reject(new Error(`Unable to load ${globalName}.`));
    document.head.appendChild(script);
  });
}

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
  const [buildingPreview, setBuildingPreview] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [codedDocument, setCodedDocument] = useState({
    blocks: [
      { role: 'title', text: 'Document Title' },
      { role: 'heading', text: 'Section Heading' },
      { role: 'body', text: 'Adjustable body text preview. Update font sizes and weight before generating your PDF.' },
    ],
  });
  const [styleOptions, setStyleOptions] = useState(DEFAULT_STYLE_OPTIONS);
  const previewRef = useRef(null);

  async function buildPreviewFromFile(file) {
    if (!file) return;

    try {
      setBuildingPreview(true);
      const base64 = await fileToBase64(file);
      const uploadedFile = {
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        data: base64,
      };

      const response = await fetch('/api/extract-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadedFile, previewOnly: true }),
      });

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || 'Unable to build live preview.');
      }

      const payload = await response.json();
      if (payload?.codedDocument?.blocks?.length) {
        setCodedDocument(payload.codedDocument);
        setStatus('Preview ready. If this looks good, click Generate PDF to export this exact coded layout.');
      }
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBuildingPreview(false);
    }
  }

  function handleFileSelect(file) {
    if (!file) return;

    setUpload(file);
    buildPreviewFromFile(file);
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

    if (!previewRef.current) {
      setStatus('Live preview is not ready yet.');
      return;
    }

    setBusy(true);

    try {
      await loadScriptOnce('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js', 'html2canvas');
      await loadScriptOnce('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js', 'jspdf');

      const html2canvas = window.html2canvas;
      const { jsPDF } = window.jspdf || {};

      if (!html2canvas || !jsPDF) {
        throw new Error('Unable to initialize PDF exporter.');
      }

      const canvas = await html2canvas(previewRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'letter',
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 24;
      const renderWidth = pageWidth - margin * 2;
      const fullPageHeight = (canvas.height * renderWidth) / canvas.width;

      if (fullPageHeight <= pageHeight - margin * 2) {
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margin, margin, renderWidth, fullPageHeight, undefined, 'FAST');
      } else {
        const pageContentHeightPt = pageHeight - margin * 2;
        const pageContentHeightPx = Math.floor((pageContentHeightPt * canvas.width) / renderWidth);
        let yOffset = 0;
        let firstPage = true;

        while (yOffset < canvas.height) {
          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = Math.min(pageContentHeightPx, canvas.height - yOffset);
          const sliceContext = sliceCanvas.getContext('2d');

          if (!sliceContext) throw new Error('Unable to render PDF page image.');

          sliceContext.drawImage(
            canvas,
            0,
            yOffset,
            canvas.width,
            sliceCanvas.height,
            0,
            0,
            canvas.width,
            sliceCanvas.height
          );

          if (!firstPage) pdf.addPage();
          firstPage = false;

          const sliceHeightPt = (sliceCanvas.height * renderWidth) / sliceCanvas.width;
          pdf.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', margin, margin, renderWidth, sliceHeightPt, undefined, 'FAST');

          yOffset += sliceCanvas.height;
        }
      }

      const outputName = `${fileName || upload?.name?.replace(/\.[^/.]+$/, '') || 'document'}.pdf`;
      pdf.save(outputName);
      setStatus('PDF downloaded successfully from the live preview.');
    } catch (error) {
      setStatus(error.message || 'Unable to export live preview.');
    } finally {
      setBusy(false);
    }
  }



  return (
    <main className={styles.main}>
      <section className={styles.card}>
        <h1>Upload File → PDF</h1>
        <p>Upload a file and convert it to PDF. Supported preview input: DOCX, TXT, RTF, HTML. The generated PDF exports exactly what you see in the live preview.</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <label htmlFor="upload">Upload a file (or drop below)</label>
          <input
            id="upload"
            type="file"
            accept=".docx,.txt,.rtf,.html,.htm"
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

          <button type="submit" disabled={busy || buildingPreview}>
            {buildingPreview ? 'Building coded preview...' : busy ? 'Generating...' : 'Generate PDF'}
          </button>
        </form>

        <section className={styles.previewCard}>
          <p className={styles.previewLabel}>Live preview</p>
          <div className={styles.previewPage} ref={previewRef}>
            {logoUrl && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoUrl} alt="Logo preview" className={styles.previewLogo} />
              </>
            )}
            {(codedDocument?.blocks || []).map((block, index) => {
              const text = block?.text?.trim();
              if (!text) return null;
              const isTitle = block.role === 'title';
              const isHeading = block.role === 'heading';
              const fontSize = isTitle ? styleOptions.titleFontSize : isHeading ? styleOptions.headingFontSize : styleOptions.bodyFontSize;
              const fontWeight = isTitle ? (styleOptions.titleFontWeight === 'thin' ? 200 : 500) : isHeading ? 500 : 400;
              return (
                <p
                  key={`${text}-${index}`}
                  style={{
                    fontSize: `${fontSize}px`,
                    lineHeight: isTitle ? 1.3 : isHeading ? 1.4 : 1.6,
                    fontWeight,
                    textAlign: isTitle ? 'center' : 'left',
                    margin: isTitle ? '10px 0 14px' : '0 0 10px',
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
