import LeaderboardTable from "@components/LeaderboardTable"; // ← поправь путь
import { useCallback, useEffect, useRef, useState } from "react";
import api from "../api";
import chamberImg from "../assets/images/dodge-chamber.webp";
import orbImg from "../assets/images/dodge-orb.png";
import store from "../store";
import { audio } from "./core/audio";
import { LAYOUT } from "./core/config";
import { DodgeEngine } from "./core/engine";
import DodgeFrame from "./DodgeFrame";
import { C, MONO, pct } from "./dodgeTheme";

const GAME_ID = "dodge";

const SEEN_KEY = "dodge:tutorialSeen";

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const loadImage = (url) =>
    new Promise((resolve) => {
        if (!url) return resolve(null);
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
    });
const readSeen = () => {
    try {
        return localStorage.getItem(SEEN_KEY) === "1";
    } catch {
        return false;
    }
};
const vibrate = (p) => {
    try {
        navigator.vibrate?.(p);
    } catch {
        /* iOS Safari: не поддерживается */
    }
};

export default function Dodge({ sprites, staticUrl, monsterName, monsterId, onExit }) {
    const canvasRef = useRef(null);
    const engineRef = useRef(null);
    const assetsRef = useRef(null);
    const phaseRef = useRef(readSeen() ? "ready" : "tutorial");
    const metaRef = useRef({});
    const sessionRef = useRef(null);

    const [box, setBox] = useState({ w: 0, h: 0 });
    const [ready, setReady] = useState(false);
    const [phase, setPhase] = useState(phaseRef.current);
    const [orbs, setOrbs] = useState(0);
    const [sec, setSec] = useState(0);
    const [level, setLevel] = useState(1);
    const [result, setResult] = useState(null);
    const [best, setBest] = useState(null);
    const [muted, setMuted] = useState(audio.isMuted());

    const idleUrl = sprites?.idle;
    const walkUrl = sprites?.walk;
    const hitUrl = sprites?.hit;
    const avatarSrc = idleUrl || staticUrl;
    const borfId = store.getBorfId();
    metaRef.current = { name: monsterName, id: borfId };

    const go = useCallback((p) => {
        phaseRef.current = p;
        setPhase(p);
    }, []);

    // ---------- загрузка картинок ----------
    useEffect(() => {
        let off = false;
        audio.preload();
        (async () => {
            const [chamber, orb, idle, walk, hit, stat] = await Promise.all([
                loadImage(chamberImg),
                loadImage(orbImg),
                loadImage(idleUrl),
                loadImage(walkUrl),
                loadImage(hitUrl),
                loadImage(staticUrl),
            ]);
            if (off) return;
            const fb = idle || stat; // деградация: если спрайтов нет — одна статичная картинка
            assetsRef.current = { chamber, orb, idle: fb, walk: walk || fb, hit: hit || fb };
            setReady(true);
        })();
        return () => {
            off = true;
        };
    }, [idleUrl, walkUrl, hitUrl, staticUrl]);

    // ---------- движок ----------
    const handleGameOver = useCallback(
        async (r) => {
            const entry = { name: metaRef.current.name, orbs: r.orbs, seconds: Math.round(r.seconds * 100) / 100 };
            setResult({ ...entry, loading: true });
            go("over");
            const session = sessionRef.current;
            sessionRef.current = null;
            if (!session) {
                setResult({ ...entry, loading: false, unsaved: true });
                return;
            }
            try {
                const res = await api.finishGameSession(GAME_ID, session.SessionId, {
                    metrics: { orbs: r.orbs, seconds: entry.seconds },
                    moves: r.moves,
                });
                if (res.Record) audio.play("mint", { volume: 0.8 });
                setResult({ ...entry, ...res, loading: false });
            } catch (e) {
                console.error(e);
                setResult({ ...entry, loading: false, unsaved: true });
            }
        },
        [go]
    );

    useEffect(() => {
        if (!ready || !canvasRef.current) return;
        const engine = new DodgeEngine({
            canvas: canvasRef.current,
            assets: assetsRef.current,
            callbacks: {
                onMove: () => audio.play("click", { volume: 0.5 }),
                onDodge: (n) => {
                    setOrbs(n);
                    audio.play("eat", { volume: 0.3, minGap: 0.06 });
                },
                onSecond: setSec,
                onLevel: setLevel,
                onHit: () => {
                    audio.play("blow");
                    audio.stopMusic(0.4);
                    vibrate([30, 40, 90]);
                },
                onGameOver: handleGameOver,
            },
        });
        engineRef.current = engine;
        return () => {
            engine.destroy();
            engineRef.current = null;
        };
    }, [ready, handleGameOver]);

    useEffect(() => {
        engineRef.current?.resize(
            box.w * LAYOUT.roomHole.w,
            box.h * LAYOUT.roomHole.h,
            Math.min(window.devicePixelRatio || 1, 2)
        );
    }, [box, ready]);

    useEffect(() => () => audio.stopMusic(0), []);

    useEffect(() => {
        if (phase !== "ready") return;
        let off = false;
        api.getGameStats(monsterId)
            .then((r) => !off && setBest(r?.Stats?.[GAME_ID] || null))
            .catch(() => {});
        return () => {
            off = true;
        };
    }, [phase, monsterId]);

    // ---------- действия ----------
    const start = useCallback(async () => {
        if (phaseRef.current === "starting" || phaseRef.current === "playing") return;
        audio.unlock();
        go("starting");
        let session = null;
        try {
            session = await api.startGameSession(GAME_ID, monsterId);
        } catch (e) {
            console.error("session start failed:", e);
        }
        if (!engineRef.current) return; // размонтировали за время запроса
        sessionRef.current = session;
        setOrbs(0);
        setSec(0);
        setLevel(1);
        setResult(null);
        engineRef.current.start(session?.Seed);
        audio.startMusic();
        go("playing");
    }, [go, monsterId]);

    const press = useCallback((dir) => {
        if (phaseRef.current === "playing") engineRef.current?.move(dir);
    }, []);

    const finishTutorial = () => {
        try {
            localStorage.setItem(SEEN_KEY, "1");
        } catch {
            /* ignore */
        }
        go("ready");
    };

    const toggleMute = () => {
        const v = !muted;
        audio.setMuted(v);
        setMuted(v);
    };

    useEffect(() => {
        const onKey = (e) => {
            if (e.repeat) return;
            const k = e.key;
            if (k === "ArrowLeft" || k === "a" || k === "A") {
                e.preventDefault();
                press(-1);
            } else if (k === "ArrowRight" || k === "d" || k === "D") {
                e.preventDefault();
                press(1);
            } else if ((k === " " || k === "Enter") && ["ready", "over"].includes(phaseRef.current)) {
                e.preventDefault();
                start();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [press, start]);

    // тап по левой/правой половине комнаты
    const onRoomPointerDown = (e) => {
        if (phaseRef.current !== "playing") return;
        const r = e.currentTarget.getBoundingClientRect();
        press(e.clientX < r.left + r.width / 2 ? -1 : 1);
    };

    const debug = store.getDebug?.();
    const status = level < 4 ? "STABLE" : level < 8 ? "STRAINED" : "CRITICAL";
    const idText = borfId ? `#${String(borfId).slice(0, 6)}...` : "#------";
    const zoneStyle = (r) => ({
        position: "absolute",
        ...pct(r),
        zIndex: 5,
        touchAction: "none",
        background: debug ? "rgba(255,0,255,0.25)" : "transparent",
    });

    return (
        <DodgeFrame
            rootProps={{ onPointerDownCapture: () => audio.unlock() }}
            onSize={setBox}
            avatarSrc={avatarSrc}
            name={monsterName}
            idText={idText}
            orbsText={String(orbs).padStart(3, "0")}
            statusText={`${status} ${fmtTime(sec)}`}
            bottomBar={(u) =>
                phase === "over" ? (
                    <>
                        <BarBtn u={u} onClick={onExit}>
                            QUIT
                        </BarBtn>
                        <BarBtn u={u} divider onClick={start}>
                            PLAY AGAIN
                        </BarBtn>
                    </>
                ) : phase === "board" ? (
                    <>
                        <BarBtn u={u} onClick={() => go("ready")}>
                            BACK
                        </BarBtn>
                        <BarBtn u={u} divider onClick={start}>
                            PLAY
                        </BarBtn>
                    </>
                ) : null
            }
            difficulty={phase === "playing" ? `LV ${level}` : ""}
            roomProps={{ onPointerDown: onRoomPointerDown }}
            room={(u) => (
                <>
                    <style>{`@keyframes dodge-blink{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
                    <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />

                    <button
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={toggleMute}
                        aria-label={muted ? "unmute" : "mute"}
                        style={{
                            position: "absolute",
                            top: 1.6 * u,
                            right: 1.6 * u,
                            width: 7 * u,
                            height: 7 * u,
                            borderRadius: "50%",
                            border: `1px solid ${C.line}`,
                            background: "rgba(5,18,13,0.6)",
                            fontSize: 3.6 * u,
                            lineHeight: 1,
                            padding: 0,
                            color: C.green,
                        }}
                    >
                        {muted ? "🔇" : "🔊"}
                    </button>

                    {!ready && (
                        <Overlay>
                            <Title u={u}>SYNCING...</Title>
                        </Overlay>
                    )}
                    {ready && phase === "tutorial" && <Tutorial u={u} onDone={finishTutorial} />}
                    {ready && phase === "ready" && (
                        <Ready
                            u={u}
                            name={monsterName}
                            best={best}
                            onBoard={() => go("board")}
                            onStart={start}
                            onHelp={() => go("tutorial")}
                            onExit={onExit}
                        />
                    )}
                    {ready && phase === "board" && <Board u={u} monsterId={monsterId} />}
                    {ready && phase === "over" && result && <Over u={u} monsterId={monsterId} result={result} />}
                </>
            )}
        >
            <div style={zoneStyle(LAYOUT.buttons.left)} onPointerDown={() => press(-1)} />
            <div style={zoneStyle(LAYOUT.buttons.right)} onPointerDown={() => press(1)} />
        </DodgeFrame>
    );
}

// ---------- мелкие компоненты ----------
function Field({ label, value, u, labelStyle }) {
    return (
        <div style={{ minWidth: 0 }}>
            <div style={labelStyle}>{label}</div>
            <div
                style={{
                    fontSize: 3.6 * u,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                }}
            >
                {value}
            </div>
        </div>
    );
}

function Overlay({ children }) {
    return (
        <div
            onPointerDown={(e) => e.stopPropagation()}
            style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(2,8,12,0.6)",
                fontFamily: MONO,
                color: C.green,
            }}
        >
            {children}
        </div>
    );
}

function Panel({ u, children }) {
    return (
        <div
            style={{
                width: "86%",
                boxSizing: "border-box",
                padding: 3.2 * u,
                background: C.panel,
                border: `1px solid ${C.line}`,
                borderRadius: 1.6 * u,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2.4 * u,
                textAlign: "center",
            }}
        >
            {children}
        </div>
    );
}

const Title = ({ u, children, color = C.green }) => (
    <div style={{ fontSize: 5 * u, fontWeight: 700, letterSpacing: 0.3 * u, color }}>{children}</div>
);

function Btn({ u, onClick, children, ghost }) {
    return (
        <button
            onClick={onClick}
            style={{
                fontFamily: MONO,
                fontSize: 3.6 * u,
                fontWeight: 700,
                letterSpacing: 0.2 * u,
                padding: `${2 * u}px ${5 * u}px`,
                borderRadius: 1.4 * u,
                border: `1px solid ${ghost ? C.line : C.btnBorder}`,
                background: ghost ? "transparent" : C.btnBg,
                color: ghost ? C.greenDim : C.btnText,
            }}
        >
            {children}
        </button>
    );
}

function Tutorial({ u, onDone }) {
    const row = (icon, text) => (
        <div style={{ display: "flex", gap: 2.6 * u, alignItems: "flex-start", textAlign: "left" }}>
            <div style={{ width: 8 * u, flexShrink: 0, fontSize: 3.8 * u, color: C.btnText, textAlign: "center" }}>
                {icon}
            </div>
            <div style={{ fontSize: 3.1 * u, lineHeight: 1.45 }}>{text}</div>
        </div>
    );
    return (
        <Overlay>
            <Panel u={u}>
                <Title u={u}>HOW TO SYNC</Title>
                {row("◀ ▶", "Tap the arrows (or the left / right side of the room) to hop one lane over.")}
                {row("●", "Orbs slide down the three lanes. Don't be standing where they land.")}
                {row(
                    "✕",
                    "One hit and the link is lost. Each orb dodged is a point, and they get faster the longer you last."
                )}
                <Btn u={u} onClick={onDone}>
                    GOT IT
                </Btn>
            </Panel>
        </Overlay>
    );
}

function Ready({ u, name, best, onStart, onHelp, onBoard, onExit }) {
    return (
        <Overlay>
            <Panel u={u}>
                <Title u={u}>READY</Title>
                <div style={{ fontSize: 3.2 * u, color: C.greenDim }}>Subject: {name}</div>
                {best && (
                    <div style={{ fontSize: 3 * u }}>
                        Best: {best.Metrics.orbs} orbs / {fmtTime(best.Metrics.seconds)} · #{best.Rank}
                    </div>
                )}
                <Btn u={u} onClick={onStart}>
                    <span style={{ animation: "dodge-blink 1.2s infinite" }}>START</span>
                </Btn>
                <div style={{ display: "flex", gap: 2 * u }}>
                    <Btn u={u} ghost onClick={onHelp}>
                        HELP
                    </Btn>
                    <Btn u={u} ghost onClick={onBoard}>
                        RANK
                    </Btn>
                    <Btn u={u} ghost onClick={onExit}>
                        EXIT
                    </Btn>
                </div>
            </Panel>
        </Overlay>
    );
}

function BarBtn({ u, onClick, children, divider }) {
    return (
        <button
            onClick={onClick}
            style={{
                flex: 1,
                height: "100%",
                padding: 0,
                background: "transparent",
                border: "none",
                borderLeft: divider ? `1px solid ${C.line}` : "none",
                color: C.green,
                fontFamily: MONO,
                fontWeight: 700,
                fontSize: 3.8 * u,
                letterSpacing: 0.2 * u,
            }}
        >
            {children}
        </button>
    );
}

function Board({ u, monsterId }) {
    return (
        <Overlay>
            <div style={{ width: "92%", height: "94%", fontSize: 3 * u, fontFamily: MONO, overflow: "hidden" }}>
                <LeaderboardTable
                    variant="hud"
                    size="compact"
                    controls={false}
                    gameId={GAME_ID}
                    monsterId={monsterId}
                />
            </div>
        </Overlay>
    );
}

function Over({ u, result, monsterId }) {
    const { orbs, seconds, loading, record, rank, total, unsaved } = result;
    return (
        <Overlay>
            <div
                style={{
                    width: "92%",
                    height: "94%",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2 * u,
                    fontSize: 3 * u,
                    fontFamily: MONO,
                }}
            >
                <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 4.2 * u, fontWeight: 700, color: C.red }}>LINK LOST</div>
                    <div style={{ fontSize: 2.4 * u, color: C.greenDim }}>
                        {record && <span style={{ color: "#ffd84a" }}>NEW RECORD · </span>}
                        {orbs} ORBS / {fmtTime(seconds)}
                        {rank ? ` · #${rank} of ${total}` : ""}
                    </div>
                </div>
                <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
                    {loading ? (
                        <div style={{ color: C.greenDim, textAlign: "center" }}>...</div>
                    ) : unsaved ? (
                        <div style={{ color: C.red, textAlign: "center" }}>SCORE NOT SAVED</div>
                    ) : (
                        <LeaderboardTable
                            variant="hud"
                            size="compact"
                            controls={false}
                            gameId={GAME_ID}
                            monsterId={monsterId}
                        />
                    )}
                </div>
            </div>
        </Overlay>
    );
}
