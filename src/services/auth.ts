// src/services/auth.ts
import AWS from 'aws-sdk';
import { query } from '../db/db';

export async function getCognitoIdentityFromDB(): Promise<string> {
  const rows = await query(`SELECT cognito_identity_id FROM users LIMIT 1`);
  if (!rows || rows.length === 0 || !rows[0].cognito_identity_id) {
    throw new Error('Cognito Identity not found in DB');
  }
  return rows[0].cognito_identity_id;
}

export async function getIdToken(): Promise<string> {
  const rows = await query(`SELECT id_token FROM users LIMIT 1`);
  if (!rows || rows.length === 0 || !rows[0].id_token) {
    throw new Error('ID token not found in DB');
  }
  return rows[0].id_token;
}

export async function setAWSCredentials(idToken: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const region = process.env.AWS_REGION!;
    const identityPoolId = process.env.IDENTITY_POOL_ID!;
    const userPoolId = process.env.USER_POOL_ID!;

    console.log('🔐 Setting AWS credentials for region:', region);
    console.log('🔐 Identity pool ID:', identityPoolId);
    console.log('🔐 User pool ID:', userPoolId);
    console.log('🔐 ID token:', idToken);

    AWS.config.update({
      region,
      credentials: new AWS.CognitoIdentityCredentials({
        IdentityPoolId: identityPoolId,
        Logins: {
          [`cognito-idp.${region}.amazonaws.com/${userPoolId}`]: idToken,
        },
      }),
    });

    (AWS.config.credentials as AWS.Credentials).refresh((err) => {
      if (err) {
        console.error('🔒 Error refreshing AWS credentials:', err);
        return reject(err);
      }
      console.log('🔐 AWS credentials refreshed');
      resolve();
    });
  });
}
