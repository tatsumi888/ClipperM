import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles.css';

// 共有ターゲットは Service Worker が無いと成立しないので、登録は必須。
registerSW({ immediate: true });

const container = document.getElementById('root');
if (!container) throw new Error('#root が見つかりません。');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
