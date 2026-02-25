import { useState } from 'react';
import styles from '../styles/Home.module.css';

export default function Home() {
  const [source, setSource] = useState('');
  const [fileName, setFileName] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus('');
    setBusy(true);

    try {
      const response = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, fileName }),
      });

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || 'Request failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${fileName || 'document'}.pdf`;
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
        <h1>Google Docs → PDF Automation</h1>
        <p>
          Enter a Google Doc URL (or ID) and this app exports it as a PDF using
          Google Drive APIs.
        </p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <label htmlFor="source">Google Doc URL or document ID</label>
          <input
            id="source"
            type="text"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            placeholder="https://docs.google.com/document/d/..."
            required
          />

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
