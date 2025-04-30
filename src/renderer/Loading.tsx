import React from 'react';

const Loading: React.FC = () => {
  return (
    <div className="splash-container bg-white bg-opacity-90 backdrop-blur-sm z-50">
      <div className="flex flex-col items-center space-y-4">
        <div className="spinner" />
        <p className="text-sm text-black font-medium tracking-wide">Loading…</p>
      </div>
    </div>
  );
};

export default Loading;
