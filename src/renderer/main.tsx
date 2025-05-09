// src/renderer/main.tsx
import './tailwind.css';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AuthProvider } from './AuthContext';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Missing #root element');
console.log("🧪 window.electron?", window.electron);

const root = createRoot(rootElement);

root.render(
  <AuthProvider>
    <App />
  </AuthProvider>
);
