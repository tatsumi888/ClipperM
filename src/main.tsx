import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initServiceWorker } from './pwaUpdate';
import './styles.css';

// 共有ターゲットは Service Worker が無いと成立しないので、登録は必須。
initServiceWorker();

const container = document.getElementById('root');
if (!container) throw new Error('#root が見つかりません。');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
