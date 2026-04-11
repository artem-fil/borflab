import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: "autoUpdate",
            workbox: {
                maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // 5 МБ
            },
            includeAssets: ["favicon.ico", "apple-touch-icon.png", "masked-icon.svg"],
            manifest: {
                name: "Project: BORFLAB",
                short_name: "Borflab",
                description: "Xenobiology & Genetic Synthesis Protocol",
                theme_color: "#3FE599",
                background_color: "#111827",
                display: "standalone",
                icons: [
                    {
                        src: "pwa-64x64.png",
                        sizes: "64x64",
                        type: "image/png",
                    },
                    {
                        src: "pwa-192x192.png",
                        sizes: "192x192",
                        type: "image/png",
                    },
                    {
                        src: "pwa-512x512.png",
                        sizes: "512x512",
                        type: "image/png",
                    },
                    {
                        src: "maskable-icon-512x512.png",
                        sizes: "512x512",
                        type: "image/png",
                        purpose: "maskable", // Важно для Android, чтобы иконка не обрезалась криво
                    },
                ],
            },
        }),
    ],
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
