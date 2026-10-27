export const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

export const C = {
    hudBg: "#0a2318",
    green: "#3df0a0",
    greenDim: "#2fbf84",
    line: "rgba(61,240,160,0.35)",
    panel: "rgba(5,18,13,0.9)",
    btnBg: "#5e3283",
    btnBorder: "#9a63c4",
    btnText: "#ecd4ff",
    red: "#ff6b6b",
};

export const pct = (r) => ({
    left: `${r.x * 100}%`,
    top: `${r.y * 100}%`,
    width: `${r.w * 100}%`,
    height: `${r.h * 100}%`,
});
