import React, { useEffect, useState } from 'react';
import { useAuth } from './AuthContext';

const Dashboard: React.FC = () => {
  // const { isLoggedIn } = useAuth(); // Check if user is logged in
  const [points, setPoints] = useState<number>(0); // Points counter
  const { logout } = useAuth();
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
      await logout(); // this will call the ipc + reset context state
    } catch (err) {
      console.error('Error during logout:', err);
    }
  };

  return (
    <div className="splash-container">
      <div className="bg-white shadow-lg rounded-lg w-full max-w-md p-8 h-76 flex flex-col items-center justify-center relative">
        <button 
          className="button-main logout-button" 
          onClick={handleLogout}
        >
          Logout
        </button>
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-700 mb-4">Your points</h1>
          <p className="text-6xl font-extrabold text-primary">{points}</p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;