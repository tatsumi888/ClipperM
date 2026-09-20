import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// Service Worker の登録は App 内の useAppUpdate（virtual:pwa-register/react）が行う。
// 共有ターゲットには Service Worker が必須だが、更新の可否を画面に出す都合上
// registerSW を直接呼ぶのではなく React の状態と一体化させている。

const container = document.getElementById('root');
if (!container) throw new Error('#root が見つかりません。');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
