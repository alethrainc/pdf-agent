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
  fontScalePercent: 100,
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

async function loadLogoDataUrl(url) {
  if (!url) return null;

  const proxiedUrl = `/api/logo-proxy?url=${encodeURIComponent(url)}`;
  const response = await fetch(proxiedUrl);
  if (!response.ok) return null;

  const blob = await response.blob();
  const dataUrl = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });

  if (!dataUrl) return null;

  const size = await new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || 1, height: image.naturalHeight || 1 });
    image.onerror = () => resolve({ width: 1, height: 1 });
    image.src = dataUrl;
  });

  return { dataUrl, ...size };
}

function getBlockStyle(blockRole, styleOptions) {
  const scale = Math.max(60, Math.min(140, Number(styleOptions.fontScalePercent) || 100)) / 100;
  const isTitle = blockRole === 'title';
  const isHeading = blockRole === 'heading';
  const fontSize = isTitle
    ? Number(styleOptions.titleFontSize) || DEFAULT_STYLE_OPTIONS.titleFontSize
    : isHeading
      ? Number(styleOptions.headingFontSize) || DEFAULT_STYLE_OPTIONS.headingFontSize
      : Number(styleOptions.bodyFontSize) || DEFAULT_STYLE_OPTIONS.bodyFontSize;

  const scaledFontSize = fontSize * scale;

  return {
    fontSize: scaledFontSize,
    lineHeight: isTitle ? scaledFontSize * 1.32 : isHeading ? scaledFontSize * 1.42 : scaledFontSize * 1.58,
    fontStyle: isTitle
      ? styleOptions.titleFontWeight === 'normal' ? 'bold' : 'normal'
      : isHeading ? 'bold' : 'normal',
    align: isTitle ? 'center' : 'left',
    paragraphGap: (isTitle ? 14 : 10) * scale,
  };
}


function getImageFormat(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return 'PNG';
  if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) return 'JPEG';
  if (dataUrl.startsWith('data:image/webp')) return 'WEBP';
  return 'PNG';
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

    if (!upload) {
      setStatus('Drop or upload a file to convert.');
      return;
    }

    setBusy(true);

    try {
      await loadScriptOnce('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js', 'jspdf');
      const { jsPDF } = window.jspdf || {};
      if (!jsPDF) throw new Error('Unable to initialize PDF exporter.');

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'letter',
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const stripeWidth = 22;
      const textLeft = 72;
      const textRight = pageWidth - 46;
      const textWidth = textRight - textLeft;
      const footerY = pageHeight - 42;
      const contentTop = 112;
      const contentBottom = pageHeight - 74;

      const logoAsset = await loadLogoDataUrl(logoUrl);
      const preparedBlocks = (codedDocument?.blocks || [])
        .map((block) => {
          const text = block?.text?.trim();
          if (!text) return null;
          const style = getBlockStyle(block.role, styleOptions);
          pdf.setFont('helvetica', style.fontStyle);
          pdf.setFontSize(style.fontSize);
          const lines = pdf.splitTextToSize(text, style.align === 'center' ? textWidth * 0.75 : textWidth);
          return { ...style, lines, text };
        })
        .filter(Boolean);

      const pages = [];
      let currentPage = [];
      let y = contentTop;

      for (const block of preparedBlocks) {
        const blockHeight = block.lines.length * block.lineHeight + block.paragraphGap;

        if (y + blockHeight > contentBottom && currentPage.length) {
          pages.push(currentPage);
          currentPage = [];
          y = contentTop;
        }

        currentPage.push({ ...block, yStart: y });
        y += blockHeight;
      }

      if (!currentPage.length) {
        currentPage.push({
          ...getBlockStyle('body', styleOptions),
          lines: [' '],
          yStart: contentTop,
          align: 'left',
          fontStyle: 'normal',
          fontSize: (Number(styleOptions.bodyFontSize) || DEFAULT_STYLE_OPTIONS.bodyFontSize) * (Math.max(60, Math.min(140, Number(styleOptions.fontScalePercent) || 100)) / 100),
          lineHeight: ((Number(styleOptions.bodyFontSize) || DEFAULT_STYLE_OPTIONS.bodyFontSize) * (Math.max(60, Math.min(140, Number(styleOptions.fontScalePercent) || 100)) / 100)) * 1.58,
        });
      }

      pages.push(currentPage);

      for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
        if (pageIndex > 0) pdf.addPage();

        pdf.setFillColor(211, 31, 45);
        pdf.rect(0, 0, stripeWidth, pageHeight, 'F');

        if (logoAsset?.dataUrl) {
          const logoWidth = 135;
          const logoHeight = (logoAsset.height * logoWidth) / logoAsset.width;
          pdf.addImage(logoAsset.dataUrl, getImageFormat(logoAsset.dataUrl), 54, 40, logoWidth, logoHeight, undefined, 'FAST');
        }

        for (const block of pages[pageIndex]) {
          pdf.setFont('helvetica', block.fontStyle);
          pdf.setFontSize(block.fontSize);
          pdf.setTextColor(0, 0, 0);

          let lineY = block.yStart;
          for (const line of block.lines) {
            if (block.align === 'center') {
              pdf.text(line, pageWidth / 2, lineY, { align: 'center' });
            } else {
              pdf.text(line, textLeft, lineY);
            }
            lineY += block.lineHeight;
          }
        }

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        pdf.setTextColor(0, 0, 0);
        pdf.text(footerMain || DEFAULT_FOOTER_MAIN, 72, footerY);
        pdf.text(footerSub || DEFAULT_FOOTER_SUB, 72, footerY + 17);
        pdf.text(`Page ${pageIndex + 1} of ${pages.length}`, pageWidth - 72, footerY + 17, { align: 'right' });
      }

      const outputName = `${fileName || upload.name.replace(/\.[^/.]+$/, '') || 'document'}.pdf`;
      pdf.save(outputName);
      setStatus('PDF generated and downloaded successfully.');
    } catch (error) {
      setStatus(error.message || 'Unable to export PDF.');
    } finally {
      setBusy(false);
    }
  }



  return (
    <main className={styles.main}>
      <section className={styles.card}>
        <h1>Upload File → PDF</h1>
        <p>Upload a file and convert it to PDF. Supported preview input: DOCX, TXT, RTF, HTML. PDF export is text-based (copy/paste friendly) with branded page styling and adjustable font scale.</p>

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
            <label htmlFor="fontScalePercent">Overall font scale (%)</label>
            <input
              id="fontScalePercent"
              type="number"
              min="60"
              max="140"
              value={styleOptions.fontScalePercent}
              onChange={(event) => setStyleOptions((prev) => ({ ...prev, fontScalePercent: Math.max(60, Math.min(140, Number(event.target.value) || prev.fontScalePercent)) }))}
            />
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
          <div className={styles.previewPage}>
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
              const scale = (Math.max(60, Math.min(140, Number(styleOptions.fontScalePercent) || 100))) / 100;
              const baseFontSize = isTitle ? styleOptions.titleFontSize : isHeading ? styleOptions.headingFontSize : styleOptions.bodyFontSize;
              const fontSize = baseFontSize * scale;
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
