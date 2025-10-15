import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite"; // Import the plugin
import basicSsl from "@vitejs/plugin-basic-ssl"; // ⬅️ NEW

// https://vite.dev/config/
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), basicSsl()],
  server: {
    https: true, // ⬅️ Tells Vite to run the server over HTTPS
    // Optional: Specify port if you want to ensure it's 3000
    // port: 3000
  },
});
