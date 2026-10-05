import { cp } from "node:fs/promises";
import { createReadStream, statSync } from "node:fs";
import path from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * pdf.js loads fonts, character maps, colour profiles and WASM decoders at runtime. Serve them
 * from our own origin at /pdfjs/ (no third-party CDN): straight from node_modules in dev, copied
 * into dist/ on build.
 */
function pdfjsAssets(): Plugin {
  const source = path.resolve("node_modules/pdfjs-dist");
  const dirs = ["cmaps", "standard_fonts", "wasm", "iccs"];
  let outDir = "";
  let isBuild = false;

  return {
    name: "pdfjs-assets",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
      isBuild = config.command === "build";
    },
    configureServer(server) {
      server.middlewares.use("/pdfjs", (req, res, next) => {
        const relative = path.normalize(decodeURIComponent((req.url ?? "").split("?")[0])).replace(/^[/\\]+/, "");
        const file = path.join(source, relative);
        if (!dirs.includes(relative.split(path.sep)[0]) || !file.startsWith(source + path.sep)) return next();
        try {
          if (!statSync(file).isFile()) return next();
        } catch {
          return next();
        }
        if (file.endsWith(".wasm")) res.setHeader("Content-Type", "application/wasm");
        createReadStream(file).pipe(res);
      });
    },
    async writeBundle() {
      if (!isBuild) return;
      for (const dir of dirs) {
        await cp(path.join(source, dir), path.join(outDir, "pdfjs", dir), { recursive: true });
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  // Read .env without a prefix filter, then expose only the public values to the browser.
  // SECRET_KEY is deliberately never passed through.
  const env = loadEnv(mode, process.cwd(), "");
  const publicEnv = {
    SUPABASE_URL: env.VITE_SUPABASE_URL || env.SUPABASE_URL || "",
    SUPABASE_PUBLISHABLE_KEY: env.VITE_SUPABASE_PUBLISHABLE_KEY || env.PUBLIC_KEY || "",
    APP_NAME: env.VITE_APP_NAME || env.APP_NAME || "Estate Organizer",
  };

  return {
    plugins: [react(), tailwindcss(), pdfjsAssets()],
    // Fixed port (other local Vite apps use the default 5173); must match the auth redirect URL.
    server: { port: 5180, strictPort: true },
    preview: { port: 5180, strictPort: true },
    define: {
      __PUBLIC_ENV__: JSON.stringify(publicEnv),
    },
  };
});
