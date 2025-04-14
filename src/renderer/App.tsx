// src/renderer/App.tsx
import { useAuth } from './AuthContext';
import AuthForm from './AuthForm';
import Dashboard from './Dashboard';

const MainContent = () => {
  const { isLoggedIn } = useAuth();

  console.log("App render - isLoggedIn:", isLoggedIn); // Add this for debugging

  return <div>{isLoggedIn ? <Dashboard /> : <AuthForm />}</div>;
};

const App = () => <MainContent />;

export default App;
