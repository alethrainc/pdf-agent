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
        body: JSON.stringify({ fileName, uploadedFile }),
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
        <p>Upload a file and convert it to PDF. Supported: PDF, TXT, RTF, HTML.</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <label htmlFor="upload">Upload a file (or drop below)</label>
          <input
            id="upload"
            type="file"
            accept=".pdf,.txt,.rtf,.html,.htm"
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

          <button type="submit" disabled={busy}>
            {busy ? 'Generating...' : 'Generate PDF'}
          </button>
        </form>

        {status && <p className={styles.status}>{status}</p>}
      </section>
    </main>
  );
}
