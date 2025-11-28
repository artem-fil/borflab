import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// https://vite.dev/config/
export default defineConfig({
    plugins: [react(), nodePolyfills({ protocolImports: true })],
    server: {
        port: 7007,
    },
    resolve: {},
    build: {
        assetsInlineLimit: 4096,
    },
});
