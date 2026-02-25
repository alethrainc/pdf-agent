import { useState } from 'react';
import styles from '../styles/Home.module.css';

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
  const [source, setSource] = useState('');
  const [fileName, setFileName] = useState('');
  const [upload, setUpload] = useState(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  function handleFileSelect(file) {
    if (!file) return;

    setUpload(file);
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

    if (!source.trim() && !upload) {
      setStatus('Provide a Google Doc URL/ID or drop/upload a file to convert.');
      return;
    }

    setBusy(true);

    try {
      let uploadedFile = null;

      if (upload) {
        const base64 = await fileToBase64(upload);
        uploadedFile = {
          name: upload.name,
          mimeType: upload.type || 'application/octet-stream',
          data: base64,
        };
      }

      const response = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, fileName, uploadedFile }),
      });

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || 'Request failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${fileName || upload?.name?.replace(/\.[^/.]+$/, '') || 'document'}.pdf`;
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
        <h1>Google Docs / File → PDF Automation</h1>
        <p>
          Paste a Google Doc URL or ID, or drag-and-drop a supported file (DOCX,
          ODT, RTF, TXT, HTML) to convert it to PDF.
        </p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <label htmlFor="source">Google Doc URL or document ID (optional if uploading)</label>
          <input
            id="source"
            type="text"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            placeholder="https://docs.google.com/document/d/..."
          />

          <label htmlFor="upload">Upload a file (or drop below)</label>
          <input
            id="upload"
            type="file"
            accept=".doc,.docx,.odt,.rtf,.txt,.html,.htm"
            onChange={(event) => handleFileSelect(event.target.files?.[0])}
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
            {upload
              ? `Ready to convert: ${upload.name}`
              : 'Drag & drop a document file here'}
          </div>

          <label htmlFor="fileName">Optional output file name</label>
          <input
            id="fileName"
            type="text"
            value={fileName}
            onChange={(event) => setFileName(event.target.value)}
            placeholder="proposal-v1"
          />

          <button type="submit" disabled={busy}>
            {busy ? 'Generating...' : 'Generate PDF'}
          </button>
        </form>

        {status && <p className={styles.status}>{status}</p>}

        <details>
          <summary>Vercel setup checklist</summary>
          <ol>
            <li>Create a Google Cloud service account with Drive API enabled.</li>
            <li>Share your Google Doc with the service account email.</li>
            <li>
              Add one of these environment variable options in Vercel:
              <ul>
                <li>
                  <code>GOOGLE_SERVICE_ACCOUNT_JSON</code> with full JSON content.
                </li>
                <li>
                  Or split variables: <code>GOOGLE_CLIENT_EMAIL</code>,{' '}
                  <code>GOOGLE_PRIVATE_KEY</code>, and{' '}
                  <code>GOOGLE_PROJECT_ID</code>.
                </li>
              </ul>
            </li>
          </ol>
        </details>
      </section>
    </main>
  );
}
