// Polyfill for iOS 15 (Safari <15.4)
if (!(Object as any).hasOwn) {
  (Object as any).hasOwn = (obj: any, prop: PropertyKey) => Object.prototype.hasOwnProperty.call(obj, prop);
}

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
