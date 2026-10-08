/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_BASE?: string;
}
declare module "*.wasm?url" {
  const url: string;
  export default url;
}
