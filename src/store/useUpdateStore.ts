/**
 * Service Worker の更新可能フラグと、実際に適用する関数を保持する。
 *
 * registerSW() はモジュール読み込み時に一度しか呼べない一方、適用のトリガー（ボタン）は
 * React 側にあるため、両者をこの store で繋ぐ。
 */

import { create } from 'zustand';

interface UpdateState {
  updateAvailable: boolean;
  setUpdateAvailable: (value: boolean) => void;
  applyUpdate: () => void;
  setApplyUpdate: (fn: () => void) => void;
}

export const useUpdateStore = create<UpdateState>((set) => ({
  updateAvailable: false,
  setUpdateAvailable: (value) => set({ updateAvailable: value }),
  applyUpdate: () => {},
  setApplyUpdate: (fn) => set({ applyUpdate: fn }),
}));
