/**
 * ページ一覧と編集状態。
 *
 * ページは「元画像 + その画像を枠にどう置くか（zoom / offset）」の組。
 * 切り抜き結果を持たないのがポイントで、出力は EPUB を作る瞬間に
 * renderFrame でまとめて焼く。編集中に出力解像度のビットマップを抱えると
 * スマホのメモリが持たない。
 */

import { create } from 'zustand';
import { clampOffset, initialPlacement, placementFor } from '../core/geometry';
import { DEFAULT_PRESET } from '../core/presets';
import type { FitMode, Offset, OutputFormat, Preset, Size } from '../core/types';
import { decodeImageFiles } from '../render/decode';

export interface PageItem {
  readonly id: string;
  readonly name: string;
  readonly bitmap: ImageBitmap;
  readonly size: Size;
  readonly zoom: number;
  readonly offset: Offset;
  /** 枠への収め方。縮小の下限を決める。 */
  readonly fitMode: FitMode;
}

const FORMAT_STORAGE_KEY = 'clipperm.outputFormat';

/** 保存済みの出力形式。未保存や読めない場合は従来どおり EPUB。 */
function loadOutputFormat(): OutputFormat {
  try {
    return localStorage.getItem(FORMAT_STORAGE_KEY) === 'pdf' ? 'pdf' : 'epub';
  } catch {
    // プライベートブラウズなどで localStorage が例外を投げることがある
    return 'epub';
  }
}

interface PagesState {
  preset: Preset;
  grayscale: boolean;
  dither: boolean;
  outputFormat: OutputFormat;
  pages: PageItem[];
  selectedId: string | null;
  /** 取り込みに失敗したファイル名。握りつぶさず画面に出すため保持する。 */
  failures: string[];

  addFiles: (files: readonly File[]) => Promise<void>;
  removePage: (id: string) => void;
  movePage: (id: string, direction: -1 | 1) => void;
  selectPage: (id: string) => void;
  setPlacement: (id: string, zoom: number, offset: Offset) => void;
  setFitMode: (id: string, mode: FitMode) => void;
  setPreset: (preset: Preset) => void;
  setGrayscale: (grayscale: boolean) => void;
  setDither: (dither: boolean) => void;
  setOutputFormat: (format: OutputFormat) => void;
  clearFailures: () => void;
  clearAll: () => void;
}

let sequence = 0;
function nextId(): string {
  sequence += 1;
  return `page-${sequence}`;
}

/**
 * プリセットが変わると枠のサイズが変わるので、全ページを置き直す。
 *
 * **各ページの fitMode を尊重すること。** ここを cover 固定にすると、
 * プリセットを変えた瞬間に「全体を表示」が黙って解除される。
 */
function replaceAll(pages: PageItem[], preset: Preset): PageItem[] {
  return pages.map((page) => {
    const placement = placementFor(page.fitMode, page.size, preset.width, preset.height);
    return { ...page, zoom: placement.zoom, offset: placement.offset };
  });
}

export const usePagesStore = create<PagesState>((set, get) => ({
  preset: DEFAULT_PRESET,
  grayscale: true,
  dither: true,
  outputFormat: loadOutputFormat(),
  pages: [],
  selectedId: null,
  failures: [],

  addFiles: async (files) => {
    if (files.length === 0) return;
    const { decoded, failures } = await decodeImageFiles(files);
    const preset = get().preset;

    const added = decoded.map((image) => {
      const size: Size = { width: image.width, height: image.height };
      const placement = initialPlacement(size, preset.width, preset.height);
      return {
        id: nextId(),
        name: image.name,
        bitmap: image.bitmap,
        size,
        zoom: placement.zoom,
        offset: placement.offset,
        fitMode: 'cover',
      } satisfies PageItem;
    });

    set((state) => ({
      pages: [...state.pages, ...added],
      selectedId: state.selectedId ?? added[0]?.id ?? null,
      failures: [...state.failures, ...failures.map((failure) => failure.name)],
    }));
  },

  removePage: (id) => {
    set((state) => {
      const target = state.pages.find((page) => page.id === id);
      // ImageBitmap は GC を待たずに閉じる。開きっぱなしだとスマホでメモリを食い続ける。
      target?.bitmap.close();
      const pages = state.pages.filter((page) => page.id !== id);
      const selectedId = state.selectedId === id ? (pages[0]?.id ?? null) : state.selectedId;
      return { pages, selectedId };
    });
  },

  movePage: (id, direction) => {
    set((state) => {
      const index = state.pages.findIndex((page) => page.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= state.pages.length) return state;
      const pages = [...state.pages];
      const [moved] = pages.splice(index, 1);
      if (!moved) return state;
      pages.splice(target, 0, moved);
      return { ...state, pages };
    });
  },

  selectPage: (id) => set({ selectedId: id }),

  setPlacement: (id, zoom, offset) => {
    set((state) => {
      const { width, height } = state.preset;
      return {
        pages: state.pages.map((page) =>
          page.id === id
            ? { ...page, zoom, offset: clampOffset(page.size, width, height, zoom, offset) }
            : page,
        ),
      };
    });
  },

  /**
   * 表示モードを切り替え、そのモードでちょうど収まる位置へ置き直す。
   *
   * **モードとズームと offset を 1 回の set で同時に書き換えるのが要点。**
   * Clipper では「先にロックを外してから fit_contain を呼ぶ」順序を守らないと
   * クランプがズームを押し戻し、ボタンが無反応に見えるという罠があった。
   * ここで原子的に更新しておけば、呼び出し側が順序を間違える余地そのものが無くなる。
   */
  setFitMode: (id, mode) => {
    set((state) => ({
      pages: state.pages.map((page) => {
        if (page.id !== id) return page;
        const placement = placementFor(mode, page.size, state.preset.width, state.preset.height);
        return { ...page, fitMode: mode, zoom: placement.zoom, offset: placement.offset };
      }),
    }));
  },

  setPreset: (preset) => set((state) => ({ preset, pages: replaceAll(state.pages, preset) })),
  setGrayscale: (grayscale) => set({ grayscale }),
  setDither: (dither) => set({ dither }),

  setOutputFormat: (format) => {
    try {
      localStorage.setItem(FORMAT_STORAGE_KEY, format);
    } catch {
      // 保存できなくても動作は続ける
    }
    set({ outputFormat: format });
  },
  clearFailures: () => set({ failures: [] }),

  clearAll: () => {
    for (const page of get().pages) page.bitmap.close();
    set({ pages: [], selectedId: null, failures: [] });
  },
}));
