import { ipcMain } from 'electron';
import AWS from 'aws-sdk';
import { CognitoUserPool, AuthenticationDetails, CognitoUser, CognitoUserAttribute } from 'amazon-cognito-identity-js';
import { query } from '../db/db';
import { startUploadLoop, stopUploadLoop } from '../services/process_manager';
import { startBackgroundProcesses } from '../services/process_manager';
import { stopContinuousCapture } from '../services/capture_engine';

let userPool: CognitoUserPool | null = null;
console.log('[auth] registering ipcMain handlers');

export function getUserPool() {
  if (userPool) return userPool;

  const { USER_POOL_ID, CLIENT_ID } = process.env;
  if (!USER_POOL_ID || !CLIENT_ID) throw new Error('Missing USER_POOL_ID or CLIENT_ID');

  userPool = new CognitoUserPool({
    UserPoolId: USER_POOL_ID,
    ClientId: CLIENT_ID
  });

  return userPool;
}

ipcMain.handle('auth:signIn', async (_event, { username, password }) => {
  const pool = getUserPool();  // 🧠 this was missing before
  const cognitoUser = new CognitoUser({ Username: username, Pool: pool });
  const authDetails = new AuthenticationDetails({ Username: username, Password: password });

  return new Promise((resolve, reject) => {
    cognitoUser.authenticateUser(authDetails, {
      onSuccess: async (result) => {
        const idToken = result.getIdToken().getJwtToken();
        const refreshToken = result.getRefreshToken().getToken();
        const accessToken = result.getAccessToken().getJwtToken();

        AWS.config.credentials = new AWS.CognitoIdentityCredentials({
          IdentityPoolId: process.env.IDENTITY_POOL_ID!,
          Logins: {
            [`cognito-idp.${process.env.AWS_REGION}.amazonaws.com/${process.env.USER_POOL_ID}`]: idToken,
          },
        });

        const credentials = AWS.config.credentials as AWS.CognitoIdentityCredentials;
        await credentials.getPromise();
        const identityId = credentials.identityId;

        query(`
          INSERT INTO users (username, email, cognito_identity_id, id_token, refresh_token, access_token)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(username) DO UPDATE SET
            cognito_identity_id = excluded.cognito_identity_id,
            id_token = excluded.id_token,
            refresh_token = excluded.refresh_token,
            access_token = excluded.access_token;
        `, [username, username, identityId, idToken, refreshToken, accessToken]);

        startBackgroundProcesses();
        startUploadLoop();
        resolve({ message: 'Signed in', cognito_identity_id: identityId });
      },
      onFailure: (err) => reject(err.message),
    });
  });
});

ipcMain.handle('auth:getStatus', async () => {
  try {
    const user = await query('SELECT * FROM users LIMIT 1');
    if (!user.length) return { isLoggedIn: false };

    const { id_token, refresh_token, username, email } = user[0];

    AWS.config.credentials = new AWS.CognitoIdentityCredentials({
      IdentityPoolId: process.env.IDENTITY_POOL_ID!,
      Logins: {
        [`cognito-idp.${process.env.AWS_REGION}.amazonaws.com/${process.env.USER_POOL_ID}`]: id_token,
      },
    });

    const credentials = AWS.config.credentials as AWS.CognitoIdentityCredentials;
    await credentials.getPromise();
    const identityId = credentials.identityId;

    query(`
      INSERT INTO users (username, email, cognito_identity_id)
      VALUES (?, ?, ?)
      ON CONFLICT(username) DO UPDATE SET
        email = excluded.email,
        cognito_identity_id = excluded.cognito_identity_id;
    `, [username, email, identityId]);

    startBackgroundProcesses();
    startUploadLoop();
    return { isLoggedIn: true, username };
  } catch (err) {
    return { isLoggedIn: false, error: err.message };
  }
});

ipcMain.handle('auth:logout', async () => {
  try {
    await stopContinuousCapture();
    await stopUploadLoop();
    query('DELETE FROM users');
    return { status: 'ok' };
  } catch (error) {
    console.error('Error during logout:', error);
    return { status: 'error', message: error.message };
  }
});

