import { useEffect, useRef, useState } from 'react';
import styles from '../styles/Home.module.css';

const DEFAULT_LOGO_URL = 'https://plusbrand.com/wp-content/uploads/2025/10/Copia-de-ALETHRA_Logo-scaled.png';
const DEFAULT_FOOTER_MAIN = '© 2026 ALETHRA™. All rights reserved.';
const DEFAULT_FOOTER_SUB = 'Confidential – Not for distribution without written authorization.';
const DEFAULT_CONFIDENTIAL_TEXT = 'Confidential, Restricted Distribution\nVersion 1.0 – March 2026';
const DEFAULT_STYLE_OPTIONS = {
  fontScale: 70,
  titleFontSize: 29,
  headingFontSize: 17,
  bodyFontSize: 15,
  titleFontWeight: 'normal',
  headingFontWeight: 'normal',
  bodyFontWeight: 'light',
};

const FONT_WEIGHT_PRESETS = {
  normal: { fontFamily: 'helvetica', fontStyle: 'normal' },
  light: { fontFamily: 'times', fontStyle: 'normal' },
};

const CUSTOM_WEIGHT_FONT_LABELS = {
  normal: 'Normal',
  light: 'Light',
};

const DEFAULT_WEIGHT_FONT_FILES = {
  normal: 'Helvetica-01.ttf',
  light: 'Helvetica-Light-05.ttf',
};

function getFontDisplayName(fontUrl = '') {
  return fontUrl.split('/').pop() || fontUrl;
}

function getWeightPreset(weight) {
  return FONT_WEIGHT_PRESETS[weight] || FONT_WEIGHT_PRESETS.normal;
}

function applyCustomWeightFonts(pdf, customWeightFonts = {}) {
  const activePresets = { ...FONT_WEIGHT_PRESETS };

  for (const [weight, font] of Object.entries(customWeightFonts)) {
    if (!font?.base64 || !font?.family) continue;
    pdf.addFileToVFS(font.fileName, font.base64);
    pdf.addFont(font.fileName, font.family, 'normal');
    activePresets[weight] = { fontFamily: font.family, fontStyle: 'normal' };
  }

  return activePresets;
}

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

function getBlockStyle(blockRole, styleOptions, nextBlockRole = null, previousBlockRole = null) {
  const fontScale = (Number(styleOptions.fontScale) || DEFAULT_STYLE_OPTIONS.fontScale) / 100;
  const isTitle = blockRole === 'title';
  const isHeading = blockRole === 'heading';
  const isCenteredBody = blockRole === 'centeredBody';
  const baseFontSize = isTitle
    ? Number(styleOptions.titleFontSize) || DEFAULT_STYLE_OPTIONS.titleFontSize
    : isHeading
      ? Number(styleOptions.headingFontSize) || DEFAULT_STYLE_OPTIONS.headingFontSize
      : Number(styleOptions.bodyFontSize) || DEFAULT_STYLE_OPTIONS.bodyFontSize;
  const centeredBodyBoost = isCenteredBody && previousBlockRole === 'title' ? 2 : 0;
  const fontSize = Math.max(8, Number(((baseFontSize + centeredBodyBoost) * fontScale).toFixed(2)));

  const headingSpacing = Math.max(8, Number((fontSize * 0.55).toFixed(2)));

  const titleSpacingAfter = nextBlockRole === 'centeredBody' ? -6 : 14;

  const blockFontWeight = isTitle
    ? styleOptions.titleFontWeight
    : isHeading
      ? styleOptions.headingFontWeight
      : styleOptions.bodyFontWeight;

  const weightPreset = getWeightPreset(blockFontWeight);

  return {
    fontSize,
    lineHeight: isTitle ? fontSize * 1.3 : isHeading ? fontSize * 1.42 : isCenteredBody ? fontSize * 1.35 : fontSize * 1.58,
    fontFamily: weightPreset.fontFamily,
    fontStyle: weightPreset.fontStyle,
    fontWeight: blockFontWeight,
    align: isTitle || isCenteredBody ? 'center' : 'left',
    spacingBefore: isHeading ? headingSpacing : 0,
    spacingAfter: isHeading ? headingSpacing : isTitle ? titleSpacingAfter : isCenteredBody ? 8 : 10,
  };
}

function getImageFormat(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return 'PNG';
  if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) return 'JPEG';
  if (dataUrl.startsWith('data:image/webp')) return 'WEBP';
  return 'PNG';
}

function splitInlineListItems(line) {
  const normalized = String(line || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return [''];

  const bulletNormalized = normalized.replace(/\s*•\s*/g, '\n• ');
  const segments = bulletNormalized.split('\n').map((segment) => segment.trim()).filter(Boolean);

  const expanded = [];
  for (const segment of segments) {
    const numberedMatches = [...segment.matchAll(/(?:^|\s)(\d+[\.)])\s+/g)];
    if (numberedMatches.length <= 1) {
      expanded.push(segment);
      continue;
    }

    numberedMatches.forEach((match, index) => {
      const contentStart = match.index + match[0].length;
      const contentEnd = index + 1 < numberedMatches.length ? numberedMatches[index + 1].index : segment.length;
      const marker = match[1];
      const content = segment.slice(contentStart, contentEnd).trim();
      if (content) expanded.push(`${marker} ${content}`);
    });
  }

  return expanded.length ? expanded : [normalized];
}

function formatBulletLine(pdf, line, maxWidth) {
  const bulletMatch = line.match(/^([•\-\*]|\d+[\.)])\s+(.*)$/);
  if (!bulletMatch) {
    const wrapped = pdf.splitTextToSize(line, maxWidth);
    return wrapped.length ? wrapped : [''];
  }

  const marker = `${bulletMatch[1]} `;
  const markerIndent = pdf.getTextWidth(marker);
  const continuationPadding = ' '.repeat(Math.max(2, marker.length));
  const availableWidth = Math.max(24, maxWidth - markerIndent);
  const wrappedContent = pdf.splitTextToSize(bulletMatch[2], availableWidth);

  if (!wrappedContent.length) return [marker.trimEnd()];

  return wrappedContent.map((part, index) => (
    index === 0 ? `${marker}${part}` : `${continuationPadding}${part}`
  ));
}

function formatBlockLinesForPdf(pdf, text, maxWidth) {
  const rawLines = String(text || '').split(/\r?\n/);
  const outputLines = [];

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      outputLines.push('');
      continue;
    }

    const logicalLines = splitInlineListItems(trimmed);
    for (const logicalLine of logicalLines) {
      const wrappedLines = formatBulletLine(pdf, logicalLine, maxWidth);
      outputLines.push(...wrappedLines);
    }
  }

  return outputLines;
}

function createPdfDocument({
  jsPDF,
  blocks,
  styleOptions,
  customWeightFonts,
  logoAsset,
  footerMain,
  footerSub,
  confidentialText,
}) {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'letter',
  });

  const activeWeightPresets = applyCustomWeightFonts(pdf, customWeightFonts);

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const stripeWidth = 22;
  const textLeft = 64;
  const textRight = pageWidth - 40;
  const textWidth = textRight - textLeft;
  const footerY = pageHeight - 42;
  const contentTop = 112;
  const contentBottom = pageHeight - 74;
  const confidentialLabel = (confidentialText || DEFAULT_CONFIDENTIAL_TEXT).trim();

  const preparedBlocks = (blocks || [])
    .map((block, index, collection) => {
      const text = block?.text?.trim();
      if (!text) return null;
      const nextBlockRole = collection[index + 1]?.role || null;
      const previousBlockRole = collection[index - 1]?.role || null;
      const style = getBlockStyle(block.role, styleOptions, nextBlockRole, previousBlockRole);
      const resolvedPreset = activeWeightPresets[style.fontWeight] || getWeightPreset(style.fontWeight);
      const resolvedStyle = { ...style, ...resolvedPreset };
      pdf.setFont(resolvedStyle.fontFamily, resolvedStyle.fontStyle);
      pdf.setFontSize(resolvedStyle.fontSize);
      const lines = formatBlockLinesForPdf(pdf, text, resolvedStyle.align === 'center' ? textWidth * 0.9 : textWidth);
      return { ...resolvedStyle, lines };
    })
    .filter(Boolean);

  const pages = [];
  let currentPage = [];
  let y = contentTop;

  for (const block of preparedBlocks) {
    const blockHeight = block.spacingBefore + (block.lines.length * block.lineHeight) + block.spacingAfter;

    if (y + blockHeight > contentBottom && currentPage.length) {
      pages.push(currentPage);
      currentPage = [];
      y = contentTop;
    }

    currentPage.push({ ...block, yStart: y + block.spacingBefore });
    y += blockHeight;
  }

  if (!currentPage.length) {
    const scaledBodySize = getBlockStyle('body', styleOptions).fontSize;
    currentPage.push({
      ...getBlockStyle('body', styleOptions),
      lines: [' '],
      yStart: contentTop,
      align: 'left',
      ...(activeWeightPresets[styleOptions.bodyFontWeight] || getWeightPreset(styleOptions.bodyFontWeight)),
      fontWeight: styleOptions.bodyFontWeight,
      fontSize: scaledBodySize,
      lineHeight: scaledBodySize * 1.58,
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

    if (pageIndex === 0 && confidentialLabel) {
      const confidentialFontSize = getBlockStyle('body', styleOptions).fontSize;
      const lightPreset = activeWeightPresets.light || getWeightPreset('light');
      pdf.setFont(lightPreset.fontFamily, lightPreset.fontStyle);
      pdf.setFontSize(confidentialFontSize);
      pdf.setTextColor(65, 69, 78);
      pdf.text(confidentialLabel, pageWidth - 72, 56, {
        align: 'right',
        baseline: 'top',
      });
    }

    for (const block of pages[pageIndex]) {
      pdf.setFont(block.fontFamily || 'helvetica', block.fontStyle);
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

    const lightPreset = activeWeightPresets.light || getWeightPreset('light');
    pdf.setFont(lightPreset.fontFamily, lightPreset.fontStyle);
    const footerFontSize = Math.max(8, Number((10 * ((styleOptions.fontScale || DEFAULT_STYLE_OPTIONS.fontScale) / 100)).toFixed(2)));
    pdf.setFontSize(footerFontSize);
    pdf.setTextColor(0, 0, 0);
    pdf.text(footerMain || DEFAULT_FOOTER_MAIN, 72, footerY);
    pdf.text(footerSub || DEFAULT_FOOTER_SUB, 72, footerY + 17);
    pdf.text(`Page ${pageIndex + 1} of ${pages.length}`, pageWidth - 72, footerY + 17, { align: 'right' });
  }

  return pdf;
}



async function readJsonResponse(response) {
  const rawBody = await response.text();

  if (!rawBody) return {};

  try {
    return JSON.parse(rawBody);
  } catch {
    if (!response.ok) {
      throw new Error('Server returned an invalid response. Try again with a smaller file.');
    }
    throw new Error('Unable to parse server response.');
  }
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

async function fontUrlToBase64(fontUrl) {
  const response = await fetch(fontUrl);
  if (!response.ok) {
    throw new Error(`Unable to load font file: ${getFontDisplayName(fontUrl)}.`);
  }

  const buffer = await response.arrayBuffer();
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
  const uploadInputRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [uploads, setUploads] = useState([]);
  const [previewDocs, setPreviewDocs] = useState([]);
  const [previewUrls, setPreviewUrls] = useState({});
  const [status, setStatus] = useState('');
  const [logoUrl, setLogoUrl] = useState(DEFAULT_LOGO_URL);
  const [footerMain, setFooterMain] = useState(DEFAULT_FOOTER_MAIN);
  const [footerSub, setFooterSub] = useState(DEFAULT_FOOTER_SUB);
  const [confidentialText, setConfidentialText] = useState(DEFAULT_CONFIDENTIAL_TEXT);
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
  const [customWeightFonts, setCustomWeightFonts] = useState({});
  const [availableFonts, setAvailableFonts] = useState([]);
  const [selectedWeightFonts, setSelectedWeightFonts] = useState({});
  const selectedWeightFontsRef = useRef(selectedWeightFonts);

  async function buildPreviewsFromFiles(uploadItems) {
    if (!uploadItems.length) {
      setPreviewDocs([]);
      return;
    }

    try {
      setBuildingPreview(true);

      const docs = await Promise.all(uploadItems.map(async ({ id, file }) => {
        try {
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

          const payload = await readJsonResponse(response);

          if (!response.ok) {
            throw new Error(payload.error || `Unable to build preview for ${file.name}.`);
          }

          return {
            id,
            name: file.name,
            blocks: payload?.codedDocument?.blocks || [],
            error: '',
          };
        } catch (error) {
          return {
            id,
            name: file.name,
            blocks: [],
            error: error.message || `Unable to build preview for ${file.name}.`,
          };
        }
      }));

      setPreviewDocs(docs);

      const firstPreview = docs.find((doc) => doc.blocks.length);
      if (firstPreview) {
        setCodedDocument({ blocks: firstPreview.blocks });
        setStatus('Previews are ready. Review each document below, then generate your PDFs.');
      } else {
        setStatus('No previews were generated. Please check file format/content and try again.');
      }
    } finally {
      setBuildingPreview(false);
    }
  }

  function handleFileSelect(fileList) {
    const selectedFiles = Array.from(fileList || []).slice(0, 10).map((file, index) => ({
      id: `${file.name}-${file.lastModified}-${index}`,
      file,
    }));
    if (!selectedFiles.length) return;

    setUploads(selectedFiles);
    buildPreviewsFromFiles(selectedFiles);
    if (!fileName && selectedFiles.length === 1) {
      const baseName = selectedFiles[0].file.name.replace(/\.[^/.]+$/, '');
      setFileName(baseName);
    }
    setStatus(
      selectedFiles.length > 1
        ? `Selected ${selectedFiles.length} files. Building preview for each upload now.`
        : `Selected file: ${selectedFiles[0].file.name}`,
    );
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragActive(false);
    handleFileSelect(event.dataTransfer.files);
  }

  useEffect(() => {
    let mounted = true;

    async function refreshPdfPreviews() {
      if (!previewDocs.length) {
        setPreviewUrls((previous) => {
          Object.values(previous).forEach((url) => {
            if (url) URL.revokeObjectURL(url);
          });
          return {};
        });
        return;
      }

      try {
        await loadScriptOnce('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js', 'jspdf');
        const { jsPDF } = window.jspdf || {};
        if (!jsPDF) throw new Error('Unable to initialize PDF preview.');

        const logoAsset = await loadLogoDataUrl(logoUrl);
        const nextPreviewUrls = {};

        for (const doc of previewDocs) {
          if (!doc.blocks?.length || doc.error) continue;

          const pdf = createPdfDocument({
            jsPDF,
            blocks: doc.blocks,
            styleOptions,
            customWeightFonts,
            logoAsset,
            footerMain,
            footerSub,
            confidentialText,
          });

          nextPreviewUrls[doc.id] = pdf.output('bloburl');
        }

        if (!mounted) {
          Object.values(nextPreviewUrls).forEach((url) => URL.revokeObjectURL(url));
          return;
        }

        setPreviewUrls((previous) => {
          Object.values(previous).forEach((url) => {
            if (url) URL.revokeObjectURL(url);
          });
          return nextPreviewUrls;
        });
      } catch {
        if (mounted) {
          setPreviewUrls((previous) => {
            Object.values(previous).forEach((url) => {
              if (url) URL.revokeObjectURL(url);
            });
            return {};
          });
        }
      }
    }

    refreshPdfPreviews();

    return () => {
      mounted = false;
    };
  }, [previewDocs, styleOptions, customWeightFonts, logoUrl, footerMain, footerSub, confidentialText]);

  useEffect(() => () => {
    Object.values(previewUrls).forEach((url) => {
      if (url) URL.revokeObjectURL(url);
    });
  }, [previewUrls]);

  useEffect(() => {
    selectedWeightFontsRef.current = selectedWeightFonts;
  }, [selectedWeightFonts]);

  useEffect(() => {
    let active = true;

    async function loadFonts() {
      try {
        const response = await fetch('/api/fonts');
        const payload = await readJsonResponse(response);
        if (!response.ok) {
          throw new Error(payload.error || 'Unable to load fonts from /public/fonts.');
        }

        if (active) {
          const fonts = payload.fonts || [];
          setAvailableFonts(fonts);

          for (const [weight, defaultFileName] of Object.entries(DEFAULT_WEIGHT_FONT_FILES)) {
            const alreadySelected = selectedWeightFontsRef.current[weight];
            if (alreadySelected) continue;

            const defaultFont = fonts.find((font) => font.name.toLowerCase() === defaultFileName.toLowerCase());
            if (!defaultFont) continue;

            await handleCustomWeightFontChange(weight, defaultFont.url);
          }
        }
      } catch (error) {
        if (active) {
          setStatus(error.message || 'Unable to load fonts from /public/fonts.');
        }
      }
    }

    loadFonts();
    return () => {
      active = false;
    };
  }, []);

  async function handleCustomWeightFontChange(weight, fontUrl) {
    if (!fontUrl) {
      setSelectedWeightFonts((prev) => ({ ...prev, [weight]: '' }));
      setCustomWeightFonts((prev) => {
        const next = { ...prev };
        delete next[weight];
        return next;
      });
      return;
    }

    const base64 = await fontUrlToBase64(fontUrl);
    const safeWeight = String(weight || 'custom').replace(/[^a-z0-9]/gi, '');
    const fontFileName = getFontDisplayName(fontUrl);
    const safeFileRoot = fontFileName.replace(/\.[^.]+$/, '').replace(/[^a-z0-9]/gi, '');

    setSelectedWeightFonts((prev) => ({ ...prev, [weight]: fontUrl }));

    setCustomWeightFonts((prev) => ({
      ...prev,
      [weight]: {
        fileName: fontFileName,
        family: `Custom${safeWeight}${safeFileRoot}${Date.now()}`,
        base64,
      },
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus('');

    if (!uploads.length) {
      setStatus('Drag/drop or click the drop zone to add at least one file to convert.');
      return;
    }

    setBusy(true);

    try {
      await loadScriptOnce('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js', 'jspdf');
      const { jsPDF } = window.jspdf || {};
      if (!jsPDF) throw new Error('Unable to initialize PDF exporter.');

      const logoAsset = await loadLogoDataUrl(logoUrl);

      for (let fileIndex = 0; fileIndex < uploads.length; fileIndex += 1) {
        const activeUpload = uploads[fileIndex];
        const response = await fetch('/api/extract-document', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uploadedFile: {
              name: activeUpload.file.name,
              mimeType: activeUpload.file.type || 'application/octet-stream',
              data: await fileToBase64(activeUpload.file),
            },
          }),
        });

        const payload = await readJsonResponse(response);

        if (!response.ok) {
          throw new Error(payload.error || `Unable to extract content from ${activeUpload.file.name}.`);
        }
        const extractedBlocks = payload?.codedDocument?.blocks || codedDocument?.blocks || [];

        const pdf = createPdfDocument({
          jsPDF,
          blocks: extractedBlocks,
          styleOptions,
          customWeightFonts,
          logoAsset,
          footerMain,
          footerSub,
          confidentialText,
        });

        const baseName = activeUpload.file.name.replace(/\.[^/.]+$/, '') || 'document';
        const outputName = uploads.length === 1 && fileName
          ? `${fileName}.pdf`
          : `${baseName}.pdf`;
        pdf.save(outputName);
      }

      setStatus(`Batch complete. Generated ${uploads.length} PDF${uploads.length === 1 ? '' : 's'}.`);
    } catch (error) {
      setStatus(error.message || 'Unable to export PDF.');
    } finally {
      setBusy(false);
    }
  }



  return (
    <main className={styles.main}>
      <section className={styles.card}>
        <h1>Document to formatted Executive Letter</h1>
        <p className={styles.subtitle}>Drag and drop your docs (or click the drop zone), review every preview, then export.</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <input
            ref={uploadInputRef}
            id="upload"
            className={styles.uploadInput}
            type="file"
            accept=".docx,.txt,.rtf,.html,.htm"
            onChange={(event) => handleFileSelect(event.target.files)}
            multiple
          />

          <div
            className={`${styles.dropZone} ${dragActive ? styles.dropZoneActive : ''}`}
            onClick={() => uploadInputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                uploadInputRef.current?.click();
              }
            }}
            role="button"
            tabIndex={0}
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
          >
            {uploads.length ? `Ready: ${uploads.length} file${uploads.length === 1 ? '' : 's'}` : 'Drag & drop files here or click to browse'}
          </div>

          <details className={styles.settingsPanel}>
            <summary>Settings (optional)</summary>

          <label htmlFor="fileName">Optional output file name (single file only)</label>
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

          <label htmlFor="confidentialText">First-page top-right confidential text</label>
          <textarea
            id="confidentialText"
            value={confidentialText}
            onChange={(event) => setConfidentialText(event.target.value)}
            rows={2}
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
              <option value="normal">Normal</option>
              <option value="light">Light</option>
            </select>

            <label htmlFor="headingFontWeight">Heading weight</label>
            <select
              id="headingFontWeight"
              value={styleOptions.headingFontWeight}
              onChange={(event) => setStyleOptions((prev) => ({ ...prev, headingFontWeight: event.target.value }))}
            >
              <option value="normal">Normal</option>
              <option value="light">Light</option>
            </select>

            <label htmlFor="bodyFontWeight">Body weight</label>
            <select
              id="bodyFontWeight"
              value={styleOptions.bodyFontWeight}
              onChange={(event) => setStyleOptions((prev) => ({ ...prev, bodyFontWeight: event.target.value }))}
            >
              <option value="normal">Normal</option>
              <option value="light">Light</option>
            </select>

            <p className={styles.weightHint}>Drop your .ttf/.otf files into <code>public/fonts</code>, then select which file to use for Normal and Light.</p>

            <div className={styles.customFontGrid}>
              {Object.entries(CUSTOM_WEIGHT_FONT_LABELS).map(([weightKey, label]) => (
                <div key={weightKey} className={styles.customFontRow}>
                  <label htmlFor={`custom-font-${weightKey}`}>{label} font</label>
                  <select
                    id={`custom-font-${weightKey}`}
                    value={selectedWeightFonts[weightKey] || ''}
                    onChange={(event) => handleCustomWeightFontChange(weightKey, event.target.value)}
                  >
                    <option value="">Default ({label})</option>
                    {availableFonts.map((font) => (
                      <option key={font.url} value={font.url}>{font.name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <label htmlFor="fontScale">Overall text scale (%)</label>
            <input
              id="fontScale"
              type="number"
              min="60"
              max="140"
              value={styleOptions.fontScale}
              onChange={(event) => setStyleOptions((prev) => ({ ...prev, fontScale: Number(event.target.value) || prev.fontScale }))}
            />
          </div>

          </details>

          <button type="submit" disabled={busy || buildingPreview}>
            {buildingPreview ? 'Building previews...' : busy ? 'Generating...' : 'Generate PDF'}
          </button>
        </form>

        <section className={styles.previewCard}>
          <p className={styles.previewLabel}>Previews</p>
          <div className={styles.previewGrid}>
            {previewDocs.map((doc) => (
              <article key={doc.id} className={styles.previewPage}>
                <p className={styles.previewTitle}>{doc.name}</p>
                {doc.error ? (
                  <p className={styles.previewUnavailable}>{doc.error}</p>
                ) : previewUrls[doc.id] ? (
                  <iframe title={`Preview ${doc.name}`} src={previewUrls[doc.id]} className={styles.previewFrame} />
                ) : (
                  <p className={styles.previewUnavailable}>Generating preview…</p>
                )}
              </article>
            ))}
          </div>
        </section>

        {status && <p className={styles.status}>{status}</p>}
      </section>
    </main>
  );
}
