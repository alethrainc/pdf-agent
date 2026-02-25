# PDF Agent (upload-first)

This app converts uploaded files into a downloadable PDF.

Supported input types:

- PDF (returned as-is)
- TXT
- RTF
- HTML/HTM

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## API

`POST /api/generate-pdf`

Body:

```json
{
  "fileName": "optional-custom-name",
  "uploadedFile": {
    "name": "notes.txt",
    "data": "<base64>"
  }
}
```

Returns a PDF binary response.
