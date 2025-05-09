import React from 'react';

const Loading: React.FC = () => {
  return (
    <div className="splash-container loading">
      <div className="flex flex-col items-center space-y-4">
        <div className="spinner" />
        <p className="text-sm text-black font-medium tracking-wide">Loading…</p>
      </div>
    </div>
  );
};

export default Loading;
