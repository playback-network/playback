import { ipcMain } from 'electron';
import AWS from 'aws-sdk';
import { CognitoUserPool, AuthenticationDetails, CognitoUser, CognitoUserAttribute } from 'amazon-cognito-identity-js';
import { query } from '../db/db';
import { startUploadLoop, stopUploadLoop } from '../services/process_manager';
import { startBackgroundProcesses } from '../services/process_manager';
import { stopContinuousCapture } from '../services/capture_engine';

let userPoolData = {
    UserPoolId: process.env.USER_POOL_ID,
    ClientId: process.env.CLIENT_ID
};
let userPool = new CognitoUserPool(userPoolData);

let isUserAuthenticated = false;

ipcMain.handle('auth:signUp', async (_event, { username, password, email }) => {
  return new Promise((resolve, reject) => {
    const attributes = [new CognitoUserAttribute({ Name: 'email', Value: email })];
    userPool.signUp(username, password, attributes, null, (err, result) => {
      if (err) return reject(err.message);
      resolve({ message: 'User registered successfully', username: result?.user.getUsername() });
      startBackgroundProcesses();
      startUploadLoop();
    });
  });
});

ipcMain.handle('auth:confirmSignUp', async (_event, { username, code }) => {
  const cognitoUser = new CognitoUser({ Username: username, Pool: userPool });
  return new Promise((resolve, reject) => {
    cognitoUser.confirmRegistration(code, true, (err, result) => {
      if (err) return reject(err.message);
      resolve({ message: 'User confirmed', result });
    });
  });
});

ipcMain.handle('auth:signIn', async (_event, { username, password }) => {
  const cognitoUser = new CognitoUser({ Username: username, Pool: userPool });
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

        isUserAuthenticated = true;
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

    isUserAuthenticated = true;
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
    isUserAuthenticated = false;
    return { status: 'ok' };
  } catch (error) {
    console.error('Error during logout:', error);
    return { status: 'error', message: error.message };
  }
});

