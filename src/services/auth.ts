// src/services/auth.ts
import AWS from 'aws-sdk';
import { query } from '../db/db';

let lastCredRefresh = 0;

/**
 * get the current Cognito Identity ID from the local DB.
 * used for generating the correct S3 path during uploads.
 */
export async function getCognitoIdentityFromDB(): Promise<string> {
  const rows = await query(`SELECT cognito_identity_id FROM users LIMIT 1`);
  if (!rows || rows.length === 0 || !rows[0].cognito_identity_id) {
    throw new Error('Cognito Identity not found in DB');
  }
  return rows[0].cognito_identity_id;
}

/**
 * fetch the cached Cognito ID token from the DB.
 * used for setting up temporary AWS credentials.
 */
export async function getIdToken(): Promise<string> {
  const rows = await query(`SELECT id_token FROM users LIMIT 1`);
  if (!rows || rows.length === 0 || !rows[0].id_token) {
    throw new Error('ID token not found in DB');
  }
  return rows[0].id_token;
}

/**
 * sets AWS SDK credentials using the provided Cognito ID token.
 * avoids redundant refreshes by default (120s cooldown).
 */
export async function setAWSCredentials(idToken: string): Promise<void> {
  const region = process.env.AWS_REGION!;
  const identityPoolId = process.env.IDENTITY_POOL_ID!;
  const userPoolId = process.env.USER_POOL_ID!;

  // always update AWS.config with the latest token
  const creds = new AWS.CognitoIdentityCredentials({
    IdentityPoolId: identityPoolId,
    Logins: {
      [`cognito-idp.${region}.amazonaws.com/${userPoolId}`]: idToken,
    },
  });

  AWS.config.update({ region, credentials: creds });

  const now = Date.now();
  const needsRefresh = (creds.expired || now - lastCredRefresh > 120_000);

  if (!needsRefresh) return;

  return new Promise((resolve, reject) => {
    creds.refresh((err) => {
      if (err) {
        console.error('🔒 Error refreshing AWS credentials:', err);
        return reject(err);
      }
      lastCredRefresh = Date.now();
      console.log('🔐 AWS credentials refreshed');
      resolve();
    });
  });
}
