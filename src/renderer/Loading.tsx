import React from 'react';

const Loading: React.FC = () => {
  return (
    <div className='splash-container'>
      <div className='flex flex-col px-8 rounded-md bg-gray-200 py-12 items-center justify-center splash-content'>
        <div className="spinner"></div>
        <h1>Identifying you...</h1>
      </div>
    </div>
  );
}

export default Loading;