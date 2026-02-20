export default {
    content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
    theme: {
        extend: {
            backgroundImage: {
                app: "url('/background.webp')",
                metal: "url('/metal.jpeg')",
                foam: "url('/foam.jpeg')",
            },
            fontFamily: {
                plex: ['"IBM Plex Mono"', "monospace"],
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
