export default {
    content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
    theme: {
        extend: {
            backgroundImage: {
                app: "url('/background.webp')",
            },
            fontFamily: {
                plex: ['"IBM Plex Mono"', "monospace"],
            },
        },
    },
    plugins: [],
};
