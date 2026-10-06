/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Geoapify browser key for address suggestions while typing. Optional: without
   * it, search falls back to submit-only (Enter). Restrict it to the site's
   * origins in the Geoapify dashboard; it ships in the page by design.
   */
  readonly VITE_GEOAPIFY_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
