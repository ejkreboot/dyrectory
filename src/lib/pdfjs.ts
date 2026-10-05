// Loads pdf.js for the in-browser form filler. Import this before "pdfjs-dist/web/pdf_viewer.mjs":
// the viewer components read the core library from globalThis.pdfjsLib when they are evaluated.
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
(globalThis as { pdfjsLib?: typeof pdfjsLib }).pdfjsLib = pdfjsLib;

/** Runtime data served from our own origin by the pdfjs-assets Vite plugin. */
function asset(dir: string): string {
  return new URL(`/pdfjs/${dir}/`, window.location.origin).href;
}

export function loadPdf(data: Uint8Array) {
  return pdfjsLib.getDocument({
    data,
    cMapUrl: asset("cmaps"),
    cMapPacked: true,
    standardFontDataUrl: asset("standard_fonts"),
    wasmUrl: asset("wasm"),
    iccUrl: asset("iccs"),
    enableXfa: true,
  });
}

export { pdfjsLib };
