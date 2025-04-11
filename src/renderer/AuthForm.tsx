import React, { useState } from 'react';
import { useAuth } from './AuthContext';  // Import your auth methods
import logo from './assets/logo.jpg';  // Add your logo if available

interface AuthFormProps {
  onSubmit?: (credentials: { username: string; password: string }) => void;
}

const AuthForm: React.FC<AuthFormProps> = ({ onSubmit }) => {
  const [password, setPassword] = useState('ThisIsMyTest1234!');
  const [email, setEmail] = useState('weberfabian1@gmx.de');
  const [confirmationCode, setConfirmationCode] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [username, setUsername] = useState<string>('weberfabian1@gmx.de');
  const [needsConfirmation, setNeedsConfirmation] = useState(false); // Flag for email verification
  const [message, setMessage] = useState('');
  const { login } = useAuth();

  // Handle sign-up
  const handleSignUp = () => {
    window.electron.auth.signUp(username, password, email)
      .then(result => {
        setMessage(result.message);
        setNeedsConfirmation(true);  // Expecting confirmation after sign-up
      })
      .catch(err => {
        setMessage(`Error signing up: ${err}`);
      });
  };

  // Handle confirming the sign-up
  const handleConfirmSignUp = () => {
    window.electron.auth.confirmSignUp(username, confirmationCode)
      .then(result => {
        setMessage('User confirmed successfully!');
        setNeedsConfirmation(false); // Confirmation is done, reset flag
      })
      .catch(err => {
        setMessage(`Error confirming sign-up: ${err}`);
      });
  };

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const result = await window.electron.auth.signIn(email, password);
      console.log("Sign in result:", result); // Add this for debugging
      if (result?.message === 'Signed in') {
        await login();
        setMessage('Login successful');
      }
    } catch (err) {
      console.error('Sign in error:', err);
      setMessage('Login failed');
    }
  };
  
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); // Prevent default form submission
    if (needsConfirmation) {
      handleConfirmSignUp();
    } else if (isSignUp) {
      handleSignUp();
    } else {
      handleSignIn(e);
    }
  };

  return (
    <div className="splash-container">
      <div className="bg-gray-50 shadow-md rounded-lg px-10 py-8 w-full max-w-md">
        <div className="flex justify-center">
          <img src={logo} height={50} width={50} alt="Playback Logo" className="h-12" />
        </div>
        <h2 className="text-2xl font-semibold text-gray-700 text-center mt-4">
          {isSignUp ? 'Sign Up' : 'Sign In'}
        </h2>
        <form className="mt-6" onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-gray-600 text-sm font-medium">Email</label>
            <input
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setEmail(e.target.value);
              }}
              placeholder="Enter email"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
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
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              required
            />
          </div>

          {needsConfirmation && (
            <div className="mb-4">
              <label className="block text-gray-600 text-sm font-medium">Confirmation Code</label>
              <input
                type="text"
                value={confirmationCode}
                onChange={(e) => setConfirmationCode(e.target.value)}
                placeholder="Enter confirmation code"
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                required
              />
              <button
                type="submit"
                className="w-full py-2 px-4 bg-primary text-white rounded-md font-semibold hover:bg-primary-dark mt-4"
              >
                Confirm Sign Up
              </button>
            </div>
          )}

          <button
            type="submit"
            className="w-full py-2 px-4 bg-primary text-white rounded-md font-semibold hover:bg-primary-dark transition-colors"
          >
            {isSignUp ? 'Sign Up' : 'Sign In'}
          </button>
          <button
            type="submit"
            onClick={() => setIsSignUp(!isSignUp)}
            className="w-full py-2 px-4 mt-2 text-primary hover:text-primary-dark hover:underline font-semibold text-center"
          >
            {isSignUp ? 'Switch to Sign In' : 'Switch to Sign Up'}
          </button>
        </form>
        {message && (
          <p className="text-red-500 mt-4 text-center">{message}</p>
        )}
      </div>
    </div>
  );
};

export default AuthForm;
