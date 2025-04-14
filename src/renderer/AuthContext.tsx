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
  login: () => void;
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
        setIsLoggedIn(!!result?.isLoggedIn);
      } catch (err) {
        console.error('Error checking auth status:', err);
        setIsLoggedIn(false);
      } finally {
        setLoading(false);
      }
    };

    checkAuthStatus();
  }, []);

  const login = async () => {
    setIsLoggedIn(true);
    // try {
    //   const result = await window.electron.auth.getStatus();
    //   console.log("Login attempt:", result);
    //   if (result?.isLoggedIn) {
    //     setIsLoggedIn(true);
    //   } else {
    //     setIsLoggedIn(false);
    //   }
    // } catch (err) {
    //   console.error('Error during login:', err);
    //   setIsLoggedIn(false);
    // }
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
