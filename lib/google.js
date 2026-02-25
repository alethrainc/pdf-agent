import { google } from 'googleapis';

const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

function parseServiceAccountFromEnv() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  }

  if (
    process.env.GOOGLE_CLIENT_EMAIL &&
    process.env.GOOGLE_PRIVATE_KEY &&
    process.env.GOOGLE_PROJECT_ID
  ) {
    return {
      type: 'service_account',
      project_id: process.env.GOOGLE_PROJECT_ID,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
    };
  }

  throw new Error(
    'Missing Google credentials. Set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_CLIENT_EMAIL/GOOGLE_PRIVATE_KEY/GOOGLE_PROJECT_ID.'
  );
}

export function getGoogleAuthClient() {
  const credentials = parseServiceAccountFromEnv();
  return new google.auth.GoogleAuth({
    credentials,
    scopes: GOOGLE_SCOPES,
  });
}

export function getDriveClient() {
  return google.drive({
    version: 'v3',
    auth: getGoogleAuthClient(),
  });
}
