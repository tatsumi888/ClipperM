import { useEffect, useRef } from 'react';
import { usePagesStore } from './store/usePagesStore';
import { consumeSharedFiles, hasSharedPayload } from './share/sharedFiles';
import { CropCanvas } from './ui/CropCanvas';
import { PageList } from './ui/PageList';
import { PresetSelect } from './ui/PresetSelect';
import { SendPanel } from './ui/SendPanel';

export default function App() {
  const {
    preset,
    grayscale,
    dither,
    pages,
    selectedId,
    failures,
    addFiles,
    removePage,
    movePage,
    selectPage,
    setPlacement,
    setFitMode,
    setPreset,
    setGrayscale,
    setDither,
    outputFormat,
    setOutputFormat,
    clearFailures,
    clearAll,
  } = usePagesStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const selected = pages.find((page) => page.id === selectedId) ?? pages[0] ?? null;

  // Android の共有メニューから起動された場合、Service Worker が Cache に置いた画像を拾う
  useEffect(() => {
    if (!hasSharedPayload()) return;
    void consumeSharedFiles().then((files) => {
      if (files.length > 0) void addFiles(files);
    });
  }, [addFiles]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>ClipperM</h1>
        <span className="app-subtitle">
          {preset.width}×{preset.height}
        </span>
      </header>

      <main className="app-main">
        {selected ? (
          <CropCanvas
            page={selected}
            preset={preset}
            grayscale={grayscale}
            dither={dither}
            onChange={(zoom, offset) => setPlacement(selected.id, zoom, offset)}
          />
        ) : (
          <div className="dropzone">
            <p>画像を追加してください。</p>
            <p className="hint">Android では共有メニューからも渡せます。</p>
          </div>
        )}

        {selected && (
          <>
            <div className="segmented" role="group" aria-label="枠への収め方">
              <button
                type="button"
                className={selected.fitMode === 'cover' ? 'segment active' : 'segment'}
                aria-pressed={selected.fitMode === 'cover'}
                onClick={() => setFitMode(selected.id, 'cover')}
              >
                枠を埋める
              </button>
              <button
                type="button"
                className={selected.fitMode === 'contain' ? 'segment active' : 'segment'}
                aria-pressed={selected.fitMode === 'contain'}
                onClick={() => setFitMode(selected.id, 'contain')}
              >
                全体を表示
              </button>
            </div>
            <p className="hint canvas-hint">
              枠は固定です。指で画像を動かし、2 本指で拡大縮小して構図を決めます。
              {selected.fitMode === 'contain' && ' 全体を表示すると白い余白が入ります。'}
            </p>
          </>
        )}
      </main>

      <section className="panel">
        <div className="button-row">
          <button type="button" className="primary" onClick={() => fileInputRef.current?.click()}>
            画像を追加
          </button>
          <button type="button" onClick={clearAll} disabled={pages.length === 0}>
            全部消す
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            void addFiles(files);
            // 同じファイルを続けて選べるように値をリセットする
            event.target.value = '';
          }}
        />

        {failures.length > 0 && (
          <p className="note error">
            開けなかったファイル: {failures.join(', ')}
            <button type="button" className="link" onClick={clearFailures}>
              閉じる
            </button>
          </p>
        )}
      </section>

      <section className="panel">
        <PresetSelect value={preset} onChange={setPreset} />

        <label className="checkbox">
          <input
            type="checkbox"
            checked={grayscale}
            onChange={(event) => setGrayscale(event.target.checked)}
          />
          <span>Kindle の 16 階調グレースケールにする</span>
        </label>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={dither}
            onChange={(event) => setDither(event.target.checked)}
            disabled={!grayscale}
          />
          <span>ディザリング（誤差拡散）をかける</span>
        </label>
      </section>

      <section className="panel">
        <h2 className="panel-title">ページ ({pages.length})</h2>
        <PageList
          pages={pages}
          preset={preset}
          selectedId={selected?.id ?? null}
          onSelect={selectPage}
          onRemove={removePage}
          onMove={movePage}
        />
      </section>

      <SendPanel
        pages={pages}
        preset={preset}
        grayscale={grayscale}
        dither={dither}
        outputFormat={outputFormat}
        onChangeFormat={setOutputFormat}
      />
    </div>
  );
}
