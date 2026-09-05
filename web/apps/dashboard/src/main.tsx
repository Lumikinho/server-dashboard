import React from 'react';
import ReactDOM from 'react-dom/client';
import '@server/ui/src/index.css';
import './dashboard.css';
import { App } from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);