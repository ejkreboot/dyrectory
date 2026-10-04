import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

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
    plugins: [react(), tailwindcss()],
    // Fixed port (other local Vite apps use the default 5173); must match the auth redirect URL.
    server: { port: 5180, strictPort: true },
    preview: { port: 5180, strictPort: true },
    define: {
      __PUBLIC_ENV__: JSON.stringify(publicEnv),
    },
  };
});
