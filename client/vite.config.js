import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import path from "path";

// https://vite.dev/config/
export default defineConfig({
    plugins: [react(), nodePolyfills({ protocolImports: true })],
    server: {
        port: 7007,
    },
    resolve: {
        alias: {
            "@components": path.resolve(__dirname, "src/components"),
            "@images": path.resolve(__dirname, "src/assets/images"),
            "@sounds": path.resolve(__dirname, "src/assets/sounds"),
        },
    },
    build: {
        assetsInlineLimit: 4096,
    },
});
