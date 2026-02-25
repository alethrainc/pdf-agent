# PDF Agent (Vercel-ready)

This app exports a shared Google Docs file to a PDF from a simple web form.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment variables

Set one of these credential options:

### Option A: Single JSON env var

- `GOOGLE_SERVICE_ACCOUNT_JSON` = entire service-account JSON content

### Option B: Split env vars

- `GOOGLE_CLIENT_EMAIL`
- `GOOGLE_PRIVATE_KEY` (keep `\n` newlines escaped in Vercel)
- `GOOGLE_PROJECT_ID`

## Google requirements

1. In Google Cloud Console, enable **Google Drive API**.
2. Create a service account and generate key JSON.
3. Share the target Google Doc(s) with the service-account email.

## API

`POST /api/generate-pdf`

Body:

```json
{
  "source": "https://docs.google.com/document/d/FILE_ID/edit",
  "fileName": "optional-custom-name"
}
```

Returns a PDF binary response.
