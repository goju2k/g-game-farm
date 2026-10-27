/** subset-font (HarfBuzz in wasm) ships no types — the one call vite.config.mts makes. */
declare module 'subset-font' {
  export default function subsetFont(font: Uint8Array, text: string, options?: { readonly targetFormat?: 'woff2' | 'woff' | 'sfnt' | 'truetype' }): Promise<Uint8Array>;
}
