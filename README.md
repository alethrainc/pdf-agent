# PDF Agent (upload-first)

This app converts uploaded files into a downloadable PDF.

Supported input types:

- PDF (returned as-is)
- DOCX
- TXT
- RTF
- HTML/HTM

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Optional AI formatting

To improve formatting quality (clean bullets, better executive structure), set:

- `OPENAI_API_KEY`
- optional: `OPENAI_MODEL` (defaults to `gpt-4.1-mini`)

When configured, DOCX/TXT/RTF/HTML text is polished before PDF generation while preserving meaning.


## API

`POST /api/extract-document`

Used to extract structured preview blocks from uploaded DOCX/TXT/RTF/HTML files before client-side PDF generation.

Body:

```json
{
  "uploadedFile": {
    "name": "notes.docx",
    "data": "<base64>"
  }
}
```

Returns JSON with `codedDocument.blocks` used by the browser PDF renderer.


## Logo and footer customization

The upload form now allows overriding per-document page decoration values:

- `logoUrl` (PNG URL shown on each page, default is ALETHRA logo)
- `footerMain`
- `footerSub`

If omitted, server defaults are used.
