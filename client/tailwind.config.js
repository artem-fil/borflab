export default {
    content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
    theme: {
        extend: {
            colors: {
                coralux: {
                    dark: "#517E8C",
                    light: "#5EA1B0",
                },
                plushland: {
                    dark: "#4F294F",
                    light: "#8B618B",
                },
                canopica: {
                    dark: "#5D643A",
                    light: "#95A05D",
                },
                primary: "#3FE599",
                accent: "#ED9B00",
            },
            backgroundImage: {
                app: "url('/background.webp')",
                metal: "url('/metal.jpeg')",
                paper: "url('/paper2.jpg')",
            },
            fontFamily: {
                exo: ['"Exo 2"', "sans-serif"],
                plex: ['"IBM Plex Mono"', "monospace"],
                special: ['"Special Elite"', "system-ui", "serif"],
            },
            keyframes: {
                scan: {
                    "0%": { "background-position": "0 -100%" },
                    "100%": { "background-position": "0 100%" },
                },
                "pulse-button": {
                    "0%": { "box-shadow": "0 0 2px 1px rgba(255,165,0,0.6)" },
                    "25%": { "box-shadow": "0 0 2px 3px rgba(255,165,0,0.6)" },
                    "50%": { "box-shadow": "0 0 2px 6px rgba(255,165,0,0.6)" },
                    "75%": { "box-shadow": "0 0 2px 3px rgba(255,165,0,0.6)" },
                    "100%": { "box-shadow": "0 0 2px 1px rgba(255,165,0,0.6)" },
                },
            },
            animation: {
                scan: "scan 3s linear infinite",
                "pulse-button": "pulse-button 1.5s ease-in-out infinite",
            },
        },
    },
    plugins: [],
};
