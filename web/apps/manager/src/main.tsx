import React from 'react';
import ReactDOM from 'react-dom/client';
import '@server/ui/src/index.css';
import './manager.css';
import { ToastProvider } from '@server/ui';
import { App } from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>
);