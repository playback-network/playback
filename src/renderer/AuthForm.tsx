import React, { useState } from 'react';
import { useAuth } from './AuthContext';  // Import your auth methods
import logo from './assets/logo.jpg';  // Add your logo if available
import Loading from './Loading';


const AuthForm: React.FC = () => {
  const isDev = process.env.NODE_ENV === 'development';

  const [password, setPassword] = useState(isDev ? 'ThisIsMyTest1234!' : '');
  const [username, setUsername] = useState<string>(isDev ? 'weberfabian1@gmx.de' : '');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login } = useAuth();

  const handleSignIn = async () => {
    setIsSubmitting(true);
    try {
      const { success, message } = await login(username, password);
      setMessage(success ? 'Login successful' : message);
    } catch {
      setMessage('Login failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitting) return <Loading />;
  
  return (
    <div className="splash-container">
      <div className="bg-gray-50 shadow-md rounded-lg px-6 py-6 w-full max-w-md relative">
        <div className="flex justify-center">
          <img src={logo} height={48} width={48} alt="Playback Logo" className="h-12" />
        </div>
        <h2 className="text-xl font-semibold text-gray-700 text-center mt-4">Sign In</h2>

        <form className="mt-4">
          <div className="mb-4">
            <label className="block text-gray-600 text-sm font-medium">Email</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter email"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>
          <div className="mb-4">
            <label className="block text-gray-600 text-sm font-medium">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>

          <button onClick={handleSignIn} type="submit" className="w-full mt-2 button-main">
            Sign In
          </button>
        </form>

        <p className="text-sm text-center mt-4 text-gray-600">
          Don’t have an account?{' '}
          <a
            href="https://yourdomain.com/signup"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline font-semibold"
          >
            Sign up here
          </a>
        </p>

        {message && <p className="text-red-500 mt-4 text-center">{message}</p>}
      </div>
    </div>
  );
};

export default AuthForm;
