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
                skipWaiting: true,
                clientsClaim: true,
                cleanupOutdatedCaches: true,
                maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // 5 МБ

                runtimeCaching: [
                    {
                        // API запросы - НЕ КЕШИРУЕМ
                        urlPattern: /^\/api\/.*/i,
                        handler: "NetworkOnly",
                        options: {
                            // Пустые опции = нет кеша
                        },
                    },
                    {
                        // Статические файлы (CSS, JS) - кешируем как обычно
                        urlPattern: /\.(js|css|png|jpg|jpeg|svg|gif|webp|ico)$/,
                        handler: "CacheFirst",
                        options: {
                            cacheName: "static-assets",
                            expiration: {
                                maxEntries: 100,
                                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 дней
                            },
                        },
                    },
                    {
                        // Изображения - кешируем
                        urlPattern: /\.(png|jpg|jpeg|svg|gif|webp|ico)$/,
                        handler: "CacheFirst",
                        options: {
                            cacheName: "images",
                            expiration: {
                                maxEntries: 50,
                                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 дней
                            },
                        },
                    },
                ],
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
