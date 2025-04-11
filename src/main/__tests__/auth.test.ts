import { ipcMain } from 'electron';

jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn(),
    listeners: jest.fn().mockReturnValue([])
  }
}));

describe('Auth IPC Handlers', () => {
  const testCredentials = {
    email: 'weberfabian1@gmx.de',
    password: 'ThisIsMyTest1234!'
  };

  beforeAll(() => {
    // Import your auth handlers
    require('../auth');
  });

  it('should sign in with valid credentials', async () => {
    const handler = ipcMain.listeners('auth:signIn')[0];
    const result = await handler({} as any, {
      username: testCredentials.email,
      password: testCredentials.password
    });

    expect(result).toHaveProperty('message', 'Signed in');
    expect(result).toHaveProperty('cognito_identity_id');
  });

  it('should return correct auth status', async () => {
    const handler = ipcMain.listeners('auth:getStatus')[0];
    const status = await handler({} as any);
    
    expect(status).toHaveProperty('isLoggedIn', true);
    expect(status).toHaveProperty('username', testCredentials.email);
  });

  it('should sign out successfully', async () => {
    const handler = ipcMain.listeners('auth:signOut')[0];
    const result = await handler({} as any);
    
    expect(result).toHaveProperty('message', 'Logged out');
    
    const statusHandler = ipcMain.listeners('auth:getStatus')[0];
    const status = await statusHandler({} as any);
    expect(status.isLoggedIn).toBe(false);
  });
});