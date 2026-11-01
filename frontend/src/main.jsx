import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import App from './App';
import './index.css';

function ScrollToHash() {
  React.useEffect(() => {
    const go = () => { if (window.location.hash) document.querySelector(window.location.hash)?.scrollIntoView({ behavior: 'smooth' }); };
    go(); window.addEventListener('hashchange', go);
    return () => window.removeEventListener('hashchange', go);
  }, []);
  return null;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ScrollToHash />
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
