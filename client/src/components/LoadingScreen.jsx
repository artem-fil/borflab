import { useEffect, useMemo, useState } from "react";
import DodgeFrame from "../games/DodgeFrame";
import { C, MONO } from "../games/dodgeTheme";
import store from "../store";

const FIRST = "Analyzing attributes...";

const PHRASES = [
    "Counting legs. Twice.",
    "Teaching {name} to dodge things it will definitely hit",
    "Convincing {name} to stand still for the photo...",
    "Untangling tail pixels...",
    "Feeding the borf a snack for motivation...",
    "Calibrating cuteness levels...",
    "Waking up the idle animation...",
    "Asking the walk cycle to please walk...",
    "Negotiating with the hit animation. It's not thrilled.",
    "Brushing fur, one pixel at a time...",
    "Checking under the bed for stray orbs...",
    "Borfologist is on a coffee break (not really)...",
    "Stretching before the big dodge...",
    "Explaining to {name} what an orb is...",
    "Rolling for stats. Natural 20 on fluffiness...",
    "Making sure {name} is not secretly three borfs in a coat...",
    "Removing extra eyes. Or not. Keeping them...",
    "Generating suspiciously adorable frames...",
];

const shuffle = (a) => {
    const r = [...a];
    for (let i = r.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [r[i], r[j]] = [r[j], r[i]];
    }
    return r;
};

export default function LoadingScreen({ monsterName = "Borf", progress }) {
    const borfId = store.getBorfId();
    const idText = borfId ? `#${String(borfId).slice(0, 6)}...` : "#------";

    const lines = useMemo(
        () => [FIRST, ...shuffle(PHRASES).map((p) => p.replaceAll("{name}", monsterName))],
        [monsterName]
    );
    const [i, setI] = useState(0);
    useEffect(() => {
        const t = setInterval(() => setI((x) => (x + 1) % lines.length), 3000);
        return () => clearInterval(t);
    }, [lines.length]);

    const value = typeof progress === "number" ? Math.max(0, Math.min(100, Math.round(progress))) : 0;

    return (
        <DodgeFrame
            name={monsterName}
            idText={idText}
            roomBackground="#071b13"
            room={(u) => (
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        fontFamily: MONO,
                        color: C.green,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        padding: `${5 * u}px ${4 * u}px`,
                        boxSizing: "border-box",
                    }}
                >
                    <style>{`@keyframes load-phrase{0%{opacity:0;transform:translateY(${0.8 * u}px)}15%,85%{opacity:1;transform:none}100%{opacity:0}}`}</style>

                    <div style={{ fontSize: 5 * u, letterSpacing: 0.3 * u }}>LOAD SCREEN</div>

                    <div
                        style={{
                            flex: 1,
                            width: "100%",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 2.4 * u,
                            paddingBottom: 12 * u,
                        }}
                    >
                        {/* прогресс-бар */}
                        <div
                            role="progressbar"
                            aria-valuenow={value}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            style={{
                                width: "70%",
                                height: 2.2 * u,
                                boxSizing: "border-box",
                                border: `${Math.max(1, 0.35 * u)}px solid ${C.green}`,
                                borderRadius: 2 * u,
                                padding: 0.3 * u,
                            }}
                        >
                            <div
                                style={{
                                    height: "100%",
                                    width: `${value}%`,
                                    background: C.green,
                                    borderRadius: 2 * u,
                                    boxShadow: `0 0 ${1.5 * u}px rgba(61,240,160,0.6)`,
                                    transition: "width 700ms ease-out",
                                }}
                            />
                        </div>
                        <div style={{ fontSize: 4 * u, fontVariantNumeric: "tabular-nums" }}>{value}%</div>

                        {/* фразочки */}
                        <div
                            style={{
                                marginTop: 3 * u,
                                height: 11 * u,
                                width: "90%",
                                display: "flex",
                                alignItems: "flex-start",
                                justifyContent: "center",
                            }}
                        >
                            <div
                                key={i}
                                style={{
                                    fontSize: 3.6 * u,
                                    lineHeight: 1.35,
                                    textAlign: "center",
                                    animation: "load-phrase 3s ease-in-out both",
                                }}
                            >
                                {lines[i]}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        />
    );
}
