import React, { useEffect, useState } from 'react';
import { useAuth } from './AuthContext';

const Dashboard: React.FC = () => {
  // const { isLoggedIn } = useAuth(); // Check if user is logged in
  const [points, setPoints] = useState<number>(0); // Points counter

  useEffect(() => {
    let isMounted = true;
    // Fetch initial points count
    const fetchPoints = async () => {
      const result = await window.electron.db.getRedactedCount();
      setPoints(result || 0);
    };
    fetchPoints();
  
    const interval = setInterval(() => {
      fetchPoints();
    }, 3000);
    // Set up listener for regular points updates
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);


  const handleLogout = async () => {
    const confirmed = window.confirm('Are you sure you want to log out?');
    if (!confirmed) return;

    try {
      const response = await window.electron.auth.logOut();
      console.log(response);
      
      // Redirect to sign-in screen or update UI to show logged-out state
      // Example:
      // showSignInScreen();
    } catch (error: any) {
      console.error('Error during logout:', error.message);
    }
  };

  return (
    <div className="splash-container flex items-center justify-center min-h-screen bg-gray-100">
      <div className="bg-white shadow-lg rounded-lg w-full max-w-md p-8 h-96 flex flex-col items-center justify-center">
        <button 
          className="button-main logout-button absolute top-4 right-4" 
          onClick={handleLogout}
        >
          Logout
        </button>
        <div className="text-center">
          <h1 className="text-5xl font-bold text-gray-700 mb-4">Your points</h1>
          <p className="text-8xl font-extrabold text-primary">{points}</p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;