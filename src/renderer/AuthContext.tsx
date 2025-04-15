import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import Loading from './Loading';

interface AuthContextType {
  isLoggedIn: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; message: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const result = await window.electron.auth.getStatus();
        console.log("Auth status check:", result);
        if (!result || typeof result.isLoggedIn !== 'boolean') {
          console.warn("⚠️ Invalid auth status payload:", result);
          setIsLoggedIn(false);
        } else {
          setIsLoggedIn(result.isLoggedIn);
        }
      } catch (err) {
        console.error('Error checking auth status:', err);
        setIsLoggedIn(false);
      } finally {
        setLoading(false);
      }
    };
    checkAuthStatus();
  }, []);

  const login = async (username: string, password: string): Promise<{ success: boolean; message: string }> => {
    try {
      const result = await window.electron.auth.signIn(username, password);
      console.log("Login attempt:", result);
      const success = result?.message === 'Signed in';
      setIsLoggedIn(success);
      return { success, message: result?.message || 'Unknown result' };
    } catch (err: any) {
      console.error('Error during login:', err);
      setIsLoggedIn(false);
      return { success: false, message: err?.message || 'Login failed' };
    }
  };

  const logout = async () => {
    try {
      await window.electron.auth.logOut();
      setIsLoggedIn(false);
    } catch (err) {
      console.error('Error during logout:', err);
    }
  };

  const value: AuthContextType = {
    isLoggedIn,
    login,
    logout,
  };

  if (loading) {
    return <Loading />;
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
