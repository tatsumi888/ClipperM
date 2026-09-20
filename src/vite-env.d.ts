/// <reference types="vite/client" />

// vite.config.ts の define で埋め込むビルド情報。値そのものは src/buildInfo.ts が re-export する。
declare const __BUILD_REVISION__: string;
declare const __BUILD_TIME_JST__: string;
