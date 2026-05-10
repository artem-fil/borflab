import { useEffect, useRef, useState } from "react";
import store from "../store";
import { flushLog, getLogEntries } from "../utils";

export default function DebugOverlay() {
    const [visible, setVisible] = useState(store.getDebug());
    const [entries, setEntries] = useState([]);
    const scrollRef = useRef(null);

    // Обновляем лог пока оверлей открыт
    useEffect(() => {
        if (!visible) return;
        setEntries(getLogEntries());
        const id = setInterval(() => setEntries(getLogEntries()), 500);
        return () => clearInterval(id);
    }, [visible]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [entries]);

    useEffect(() => {
        const el = document.getElementById("overlay");
        if (!el) return;

        const handleClick = () => {
            setVisible((v) => store.setDebug(!v));
        };

        el.addEventListener("click", handleClick);
        return () => el.removeEventListener("click", handleClick);
    }, []);

    if (!visible) return null;

    return (
        <div
            className="w-full h-1/2 border"
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 99999,
                background: "rgba(0,0,0,0.92)",
                display: "flex",
                flexDirection: "column",
                fontFamily: "monospace",
                fontSize: 11,
                color: "#eee",
            }}
        >
            {/* header */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 12px",
                    borderBottom: "1px solid #333",
                    background: "#111",
                    flexShrink: 0,
                }}
            >
                <span style={{ fontWeight: "bold" }}>🐛 debug — {entries.length} events</span>
                <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => flushLog("manual flush from overlay")} style={btnStyle}>
                        → TG
                    </button>
                    <button onClick={() => setVisible(false)} style={{ ...btnStyle, color: "#ff6b6b" }}>
                        ✕
                    </button>
                </div>
            </div>

            {/* log entries */}
            <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "6px 12px" }}>
                {entries.length === 0 && <div style={{ color: "#555", paddingTop: 8 }}>no entries yet</div>}
                {entries.map((e, i) => {
                    const time = new Date(e.t).toISOString().slice(11, 19);
                    const icon = e.level === "error" ? "🔴" : e.level === "warn" ? "🟡" : "·";
                    const { t, event, level, ...rest } = e;
                    const cleaned = Object.fromEntries(
                        Object.entries(rest)
                            .filter(([k]) => k !== "done")
                            .map(([k, v]) => [
                                k,
                                typeof v === "string" && v.length === 36 && v[8] === "-"
                                    ? `${v.slice(0, 4)}…${v.slice(-4)}`
                                    : v,
                            ])
                    );
                    const extra = Object.keys(cleaned).length ? " " + JSON.stringify(cleaned) : "";
                    return (
                        <div
                            key={i}
                            style={{
                                padding: "3px 0",
                                borderBottom: "1px solid #1c1c1c",
                                color: level === "error" ? "#ff6b6b" : level === "warn" ? "#ffd93d" : "#ccc",
                                wordBreak: "break-all",
                                lineHeight: 1.5,
                            }}
                        >
                            {icon} <span style={{ color: "#555" }}>{time}</span>{" "}
                            <span style={{ color: "#7ec8e3" }}>{event}</span>
                            <span style={{ color: "#999" }}>{extra}</span>
                        </div>
                    );
                })}
            </div>

            {/* footer — UA */}
            <div
                style={{
                    padding: "6px 12px",
                    borderTop: "1px solid #333",
                    background: "#111",
                    color: "#555",
                    fontSize: 10,
                    flexShrink: 0,
                    wordBreak: "break-all",
                }}
            >
                {navigator.userAgent}
            </div>
        </div>
    );
}

const btnStyle = {
    background: "none",
    border: "1px solid #444",
    borderRadius: 4,
    color: "#eee",
    cursor: "pointer",
    fontSize: 11,
    padding: "2px 8px",
};
