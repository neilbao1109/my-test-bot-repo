/// <reference types="vite/client" />

declare const __BUILD_HASH__: string;
declare const __BUILD_TIME__: string;

interface ImportMetaEnv {
  readonly VITE_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
