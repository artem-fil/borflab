import cardbackImg from "@images/card-back.webp";
import cardfrontImg from "@images/card-front.webp";
import poster3Img from "@images/poster03.webp";
import transmutatorImg from "@images/transmutator.webp";
import watermarkImg from "@images/watermark.png";
import { useWallets } from "@privy-io/react-auth/solana";
import labSound from "@sounds/lab.ogg";
import printerSound from "@sounds/printer.ogg";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api";
import store from "../store";
import { clearLog, createPollSession, flushLog, log, prepareSpecimen } from "../utils";

import { BIOMES, RARITIES, STONES } from "../config.js";

// ──────────────────────────────────────────────────────────────────

const monsterPhrases = [
    "LET ME OUT!!!",
    "I CAN SMELL YOU",
    "FEED ME TED AGAIN",
    "THIS CARD IS TOO SMALL",
    "BORF!!!",
    "I KNOW WHERE YOU LIVE",
    "MORE BIO-GEL PLS",
    "TOUCH GRASS... I DARE YOU",
    "MY BIOME IS BETTER THAN YOURS",
];

const progressMessages = [
    "🔬 Adding quantum stabilizer ✅",
    "🥬 Throwing in the bio-gel ✅",
    "💨 Adjusting carbon regulators ✅",
    "🐌 Feeding Ted to specimen ✅",
    "🧪 Mixing neural reagents ✅",
    "⚙️ Calibrating flux capacitors ✅",
    "🧠 Stabilizing entropy field ✅",
    "✨ Finalizing data output ✅",
];

export default function Step2({ current, specimen, stone, biome }) {
    const [phase, setPhase] = useState("ANALYZING"); // ANALYZING -> GENERATING -> READY
    const [analyzeResult, setAnalyzeResult] = useState(null);
    const [image, setImage] = useState(null);
    const [monsterId, setMonsterId] = useState(null);

    const [progress, setProgress] = useState(0);
    const [displayed, setDisplayed] = useState("");
    const [previewUrl, setPreviewUrl] = useState("");

    const [activeWallet, setActiveWallet] = useState(null);
    const [bubble, setBubble] = useState(null);

    const monitorRef = useRef(null);
    const audioLab = useRef(null);
    const audioPrinter = useRef(null);

    const hasStarted = useRef(false);
    const backCardRef = useRef(null);
    const frontCardRef = useRef(null);

    const twRef = useRef({
        pending: [],
        typed: "",
        current: "",
        charIdx: 0,
        resolve: null,
    });

    const phraseIndexRef = useRef(0);
    const pollSessionRef = useRef(null);

    const { wallets } = useWallets();

    // 1. Кошелек & Preview
    useEffect(() => {
        if (wallets?.length > 0) {
            const stored = localStorage.getItem("primaryWallet");
            setActiveWallet(wallets.find((w) => w.address === stored) || wallets[0]);
        }
        if (specimen instanceof Blob) {
            const url = URL.createObjectURL(specimen);
            setPreviewUrl(url);
            return () => URL.revokeObjectURL(url);
        }
    }, [wallets, specimen]);

    // 2. Старт процесса
    useEffect(() => {
        if (current === 1 && !hasStarted.current && activeWallet) {
            if (!specimen || !biome || !stone) {
                throw new Error("Incomplete data for transmutation");
            }
            hasStarted.current = true;
            runWorkflow();
        }
    }, [current, specimen, biome, stone, activeWallet]);

    // 3. Бабблы при успехе
    useEffect(() => {
        if (phase !== "READY") return;
        const interval = setInterval(() => {
            const phrase = monsterPhrases[Math.floor(Math.random() * monsterPhrases.length)];
            setBubble(phrase);
            setTimeout(() => setBubble(null), 2000);
        }, 7000);
        return () => clearInterval(interval);
    }, [phase]);

    // 4. Печатная машинка (Typewriter)
    useEffect(() => {
        const id = setInterval(() => {
            const tw = twRef.current;

            if (tw.charIdx < tw.current.length) {
                tw.charIdx++;
                setDisplayed(tw.typed + tw.current.slice(0, tw.charIdx));
                return;
            }

            if (tw.current.length > 0) {
                tw.typed += tw.current;
                tw.current = "";
                tw.charIdx = 0;
                tw.resolve?.();
                tw.resolve = null;
            }

            if (tw.pending.length > 0) {
                const { text, resolve } = tw.pending.shift();
                tw.current = text + "\n";
                tw.resolve = resolve;
            }
        }, 20);

        return () => clearInterval(id);
    }, []);

    // 5. Автоскролл консоли
    useEffect(() => {
        if (monitorRef.current) {
            monitorRef.current.scrollTop = monitorRef.current.scrollHeight;
        }
    }, [displayed, phase]);

    // 6. Анимация карточки рубашки
    useEffect(() => {
        if (phase !== "GENERATING") return;
        if (!backCardRef.current) return;

        const PHASE_START = 15;
        const t = Math.min(Math.max((progress - PHASE_START) / (100 - PHASE_START), 0), 1);
        const translateY = 100 - t * 100;

        backCardRef.current.style.transitionDuration = "300ms";
        backCardRef.current.style.transform = `translateY(${translateY}%)`;
    }, [progress, phase]);

    function getAudio(ref, src) {
        if (!ref.current) ref.current = new Audio(src);
        return ref.current;
    }

    function stopAllAudio() {
        [audioLab, audioPrinter].forEach((r) => {
            if (!r.current) return;
            r.current.pause();
            r.current.src = "";
            r.current = null;
        });
    }

    function maybeAdvancePhrase(p) {
        if (phraseIndexRef.current >= progressMessages.length) return;
        const step = 100 / progressMessages.length;
        const expectedIndex = Math.floor(p / step);

        while (phraseIndexRef.current <= expectedIndex && phraseIndexRef.current < progressMessages.length) {
            appendTypedLine(progressMessages[phraseIndexRef.current]);
            phraseIndexRef.current++;
        }
    }

    // ── ОСНОВНОЙ ПАЙПЛАЙН ──────────────────────────────────────────────────
    async function runWorkflow() {
        clearLog();
        log("workflow:start", { biome, stone: stone.Type, wallet: activeWallet.address });

        getAudio(audioLab, labSound).volume = 0.5;
        getAudio(audioLab, labSound)
            .play()
            .catch(() => {});

        try {
            const prepared = await prepareSpecimen(specimen);

            const formData = new FormData();
            formData.append("file", prepared, "specimen.jpg");
            formData.append("biome", biome);
            formData.append("stone", stone.Type);
            formData.append("userPubKey", activeWallet.address); // <-- Передаем кошелек сразу в форме

            // 1. Analyze
            log("analyze:start");
            const { Id } = await api.analyze(formData);
            log("analyze:taskCreated", { taskId: Id });

            const session1 = createPollSession();
            pollSessionRef.current = session1;

            const { result, nextTaskId } = await session1.pollTask(Id, {
                onProgress: (p) => {
                    setProgress((prev) => {
                        if (p <= prev) return prev;
                        maybeAdvancePhrase(p);
                        return p;
                    });
                },
            });

            setAnalyzeResult(result);
            await appendTypedLine("Analysis complete.");
            await appendTypedLine("Starting transmutation...");

            // 2. Generate
            setPhase("GENERATING");
            getAudio(audioLab, labSound).pause();
            getAudio(audioPrinter, printerSound).loop = true;
            getAudio(audioPrinter, printerSound).volume = 0.5;
            getAudio(audioPrinter, printerSound)
                .play()
                .catch(() => {});

            log("generate:start", { taskId: nextTaskId });
            const session2 = createPollSession();
            pollSessionRef.current = session2;

            const { result: genResult } = await session2.pollTask(nextTaskId, {
                onProgress: (p) => {
                    setProgress((prev) => Math.max(prev, p));
                    maybeAdvancePhrase(p);
                },
            });

            pollSessionRef.current = null;
            setProgress(100);

            const { image: imgData, monsterId: mId } = genResult;
            setImage(imgData);
            setMonsterId(mId);

            await appendTypedLine("💶 MONSTER CREATED SUCCESSFULLY! ✅");

            log("workflow:success", { monsterId: mId });
            flushLog(`Workflow success: monster #${mId}`);

            setPhase("READY");
            showFrontCard();
        } catch (err) {
            pollSessionRef.current?.cancel();
            pollSessionRef.current = null;
            stopAllAudio();
            log("workflow:error", { msg: err.message }, "error");
            flushLog(`Workflow error: ${err.message}`);
            appendTypedLine(`❌ ERROR: ${err.message || "Unknown error"}`);
        }
    }

    function showFrontCard() {
        stopAllAudio();
        const BACK_OUT_DURATION = 1000;
        if (backCardRef.current) {
            backCardRef.current.style.transitionDuration = `${BACK_OUT_DURATION}ms`;
            backCardRef.current.style.transform = "translateY(100%)";
        }
        if (frontCardRef.current) {
            const el = frontCardRef.current;
            el.style.transitionDuration = "1500ms";
            setTimeout(() => {
                el.style.transform = "translateY(0)";
            }, BACK_OUT_DURATION);
        }
    }

    function appendTypedLine(line) {
        if (!line) return Promise.resolve();
        return new Promise((resolve) => {
            twRef.current.pending.push({ text: line, resolve });
        });
    }

    const { bg, text, border, icon } = BIOMES[biome] || {};
    const borfId = store.getBorfId();

    return (
        <div className="flex flex-col h-full justify-end px-4">
            <div className="flex-1 flex items-center justify-center overflow-hidden">
                <img src={poster3Img} alt="poster" className="max-h-full max-w-full object-contain" />
            </div>

            <div className="relative w-full">
                {/* monitor */}
                <div
                    className="absolute text-xs text-primary font-[monospace,emoji] leading-tight"
                    style={{ top: "56%", left: "12%", width: "67%", aspectRatio: "1 / 0.6" }}
                >
                    <div
                        className="absolute inset-0 pointer-events-none animate-scan"
                        style={{
                            background:
                                "linear-gradient(180deg, rgba(63,229,153,0) 0%, rgba(63,229,153,0.8) 50%, rgba(63,229,153,0) 100%)",
                            backgroundRepeat: "no-repeat",
                            backgroundSize: "100% 8%",
                            mixBlendMode: "screen",
                            opacity: 0.7,
                        }}
                    />
                    <div className="flex justify-between items-center px-0.5 shrink-0">
                        <span>BORFLAB 37.987-B</span>
                        <span>Progress... {progress}%</span>
                    </div>
                    <div ref={monitorRef} className="overflow-auto" style={{ height: "calc(100% - 1.2em)" }}>
                        <span className="whitespace-pre-wrap">{displayed}</span>
                        <span className="animate-pulse">▋</span>
                        {image && (
                            <div className="p-1 border border-primary/50 bg-lime-900/20 pointer-events-auto">
                                <Link
                                    to="/library"
                                    className="text-primary underline decoration-dotted hover:text-white transition-colors block"
                                >
                                    &gt; ACCESS_LIBRARY.exe
                                </Link>
                            </div>
                        )}
                    </div>
                </div>

                {/* indicators */}
                {[15, 30, 45, 60, 75, 90, 100].map((val, idx) => (
                    <div
                        key={val}
                        className={`absolute z-10 aspect-square rounded-full transition-colors ${
                            progress >= val ? "bg-green-500/50" : "bg-transparent"
                        }`}
                        style={{ top: `${81.1 - idx * 3.7}%`, left: "90.5%", width: "3%" }}
                    />
                ))}

                {/* printer tray */}
                <div
                    className="absolute z-20 pointer-events-none"
                    style={{
                        bottom: "56.5%",
                        left: "15%",
                        width: "62%",
                        aspectRatio: "0.62/1",
                        clipPath: "inset(0)",
                        isolation: "isolate",
                        transform: "translateZ(0)",
                    }}
                >
                    {/* Back Card: Analysis Report */}
                    <div
                        ref={backCardRef}
                        className={`box-border w-full absolute ${text} p-1 transition-all ease-out`}
                        style={{ transform: "translateY(100%)", aspectRatio: "0.62 / 1" }}
                    >
                        <div className="absolute inset-0 w-full h-full">
                            <img className="w-full h-full" src={cardbackImg} alt="card front" />
                            {
                                <div
                                    className="absolute inset-0 pointer-events-none"
                                    style={{
                                        background: RARITIES[analyzeResult?.rarity?.toLowerCase()],
                                        mixBlendMode: "color",
                                        opacity: 0.55,
                                        maskImage: `url(${cardfrontImg})`,
                                        maskSize: "100% 100%",
                                    }}
                                />
                            }
                        </div>
                        <div className="relative p-0.5 pb-5 w-full h-full">
                            <div
                                className="absolute rounded-2xl mx-0.5 mb-5 mt-0.5 bg-paper inset-0 z-10"
                                style={{
                                    backgroundSize: "cover",
                                    mixBlendMode: "multiply",
                                    opacity: 1,
                                }}
                            />
                            <div
                                className={`z-0 text-[8px] relative flex flex-col border-4 rounded-xl w-full ring-orange-50 ring-1 h-full ${border} bg-orange-50`}
                            >
                                <p className="text-center p-px leading-none text-accent">SPECIMEN ANALYSIS LOG</p>
                                <hr className={`border-0 h-px ${bg}`} />
                                <div className=" flex w-full items-center">
                                    <div className=" flex items-center p-1 h-18 w-1/3">
                                        {previewUrl && (
                                            <img
                                                src={previewUrl}
                                                className="ml-auto mr-auto rounded object-cover"
                                                alt="input image"
                                            />
                                        )}
                                    </div>
                                    <div className={`border-0 w-px h-full ${bg}`} />
                                    <div
                                        className={`uppercase p-1 font-special w-2/3 h-18 flex flex-col justify-between ${text}`}
                                    >
                                        <p>ISSUE DATE: {`${new Date().toLocaleDateString()}`}</p>
                                        <p>SPIRAL INDEX: </p>
                                        <p>[23/840K BORF’S]</p>
                                        <p>[23/840K {stone?.Type}]</p>
                                        <p>[{biome}: 001]</p>
                                    </div>
                                </div>
                                <hr className={`border-0 h-px ${bg}`} />
                                <p className=" leading-none p-px ">
                                    <strong className={`uppercase  ${text}`}>BORFOLOGIST ID: </strong>
                                    {borfId}
                                </p>
                                <strong className={`p-0.5 ${bg} text-orange-50 uppercase`}>borf profile</strong>
                                <div className="p-0.5">
                                    <strong className={`${text} uppercase`}>01. observation: </strong>
                                    <p className="text-black leading-tight font-special">
                                        {analyzeResult?.MONSTER_PROFILE?.lore}
                                    </p>
                                </div>
                                <hr className={`border-0 h-0.5 ${bg}`} />
                                <div className="p-0.5">
                                    <strong className={`${text} uppercase`}>02. personality: </strong>
                                    <p className="text-black leading-tight font-special">
                                        {analyzeResult?.MONSTER_PROFILE?.personality}
                                    </p>
                                </div>
                                <hr className={`border-0 h-0.5 ${bg}`} />
                                <div className=" p-0.5">
                                    <strong className={`${text} uppercase`}>03. abilities: </strong>
                                    <p className="text-black leading-tight font-special">
                                        {analyzeResult?.MONSTER_PROFILE?.abilities}
                                    </p>
                                </div>
                                <hr className={`border-0 h-0.5 ${bg}`} />
                                <div className="p-0.5">
                                    <strong className={`${text} uppercase`}>04. habitat: </strong>
                                    <p className="text-black leading-tight font-special">
                                        {analyzeResult?.MONSTER_PROFILE?.habitat}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Front Card: Result */}
                    <div
                        ref={frontCardRef}
                        className={`text-[8px] box-border w-full absolute ${text} p-1 transition-all ease-out pointer-events-auto`}
                        style={{ transform: "translateY(100%)", aspectRatio: "0.62 / 1" }}
                    >
                        <Link to="/library">
                            <div className="absolute inset-0 w-full h-full">
                                <img className="w-full h-full" src={cardfrontImg} alt="card front" />
                                <div
                                    className="absolute inset-0 pointer-events-none"
                                    style={{
                                        background: RARITIES[analyzeResult?.rarity?.toLowerCase()],
                                        mixBlendMode: "color",
                                        opacity: 0.55,
                                        maskImage: `url(${cardfrontImg})`,
                                        maskSize: "100% 100%",
                                    }}
                                />
                            </div>
                            <div className="relative p-0.5 pb-5 w-full h-full ">
                                <div
                                    className="absolute rounded-xl mx-0.5 mb-5 mt-0.5 bg-paper inset-0 z-10"
                                    style={{
                                        backgroundSize: "cover",
                                        mixBlendMode: "multiply",
                                        opacity: 1,
                                    }}
                                />
                                <div
                                    className={`relative flex flex-col w-full h-full rounded-xl border-4 ring-orange-50 ring-1 ${border} bg-orange-50`}
                                >
                                    <div className="p-0.5 uppercase">
                                        <p className="leading-tight">borflab exo-bio division</p>
                                        <p className="leading-tight">security class: top secret</p>
                                        <p className="leading-tight">document type: specimen data card</p>
                                    </div>
                                    <hr className={`border-0 h-0.5 ${bg}`} />
                                    {image && (
                                        <div className="relative flex-grow flex p-0.5">
                                            {bubble && (
                                                <div
                                                    className="absolute -top-6 left-1/2 -translate-x-1/2 z-50 bg-white border-2 border-black rounded-xl px-2 py-1 text-black text-[9px] font-bold uppercase whitespace-nowrap shadow-md"
                                                    style={{
                                                        filter: "drop-shadow(1px 1px 0 black)",
                                                    }}
                                                >
                                                    {bubble}
                                                    {/* хвостик бабла */}
                                                    <div
                                                        className="absolute left-1/2 -translate-x-1/2 -bottom-2 w-0 h-0"
                                                        style={{
                                                            borderLeft: "5px solid transparent",
                                                            borderRight: "5px solid transparent",
                                                            borderTop: "8px solid black",
                                                        }}
                                                    />
                                                    <div
                                                        className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-0 h-0"
                                                        style={{
                                                            borderLeft: "4px solid transparent",
                                                            borderRight: "4px solid transparent",
                                                            borderTop: "7px solid white",
                                                        }}
                                                    />
                                                </div>
                                            )}
                                            <img
                                                src={image}
                                                className="max-h-full max-w-full w-auto h-auto object-contain mr-auto ml-auto z-10"
                                                style={{
                                                    animation: "escape 3.5s infinite",
                                                }}
                                                alt="output"
                                            />
                                            <img
                                                src={watermarkImg}
                                                className="absolute right-0 w-2/3 top-0"
                                                alt="watermark"
                                            />
                                        </div>
                                    )}

                                    <hr className={`border-0 h-0.5 ${bg}`} />
                                    <div className="flex items-center">
                                        <div className="flex flex-col gap-2 p-1 grow text-xs ">
                                            <p className="flex gap-2 items-baseline">
                                                ID:
                                                <span
                                                    className={`leading-none grow border-b ${border} uppercase  font-special text-black`}
                                                >
                                                    {analyzeResult?.MONSTER_PROFILE?.name}
                                                </span>
                                            </p>
                                        </div>
                                        <hr className={`w-0.5 h-10 ${bg}`} />
                                        <div className="p-1 w-10 h-10">
                                            <img src={STONES[stone?.Type]?.image} className="w-full" alt="borfstone" />
                                        </div>
                                    </div>
                                    <div
                                        className={`rounded-b-md flex text-xs items-center gap-2 p-0.5 uppercase text-orange-50 ${bg}`}
                                    >
                                        <img src={icon} className="w-8 opacity-50" alt="" />
                                        <span>
                                            biome: <strong className="font-bold text-accent">{biome}</strong>
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </Link>
                    </div>
                </div>

                {/* status indicators */}
                <div
                    className={`absolute z-10 aspect-square rounded-full transition-colors ${
                        image ? "bg-green-500/70" : "bg-transparent"
                    }`}
                    style={{ top: "33.5%", left: "88.7%", width: "3%" }}
                />
                <div
                    className={`absolute z-10 aspect-square rounded-full transition-colors ${
                        image ? "bg-red-500/70" : "bg-transparent"
                    }`}
                    style={{ top: "42.5%", left: "88.7%", width: "3%" }}
                />

                <div
                    className={`absolute z-10`}
                    id="overlay"
                    style={{ top: "90%", left: "10%", width: "40%", height: "8%" }}
                />
                {/* bg image */}
                <img
                    src={transmutatorImg}
                    alt="analyzer"
                    loading="eager"
                    decoding="sync"
                    className="w-full h-auto object-contain"
                />
            </div>

            <style>{`
    @keyframes escape {
        0%, 60%, 100% { transform: translate(0, 0) scale(1) rotate(0deg); }
        65%  { transform: translate(-2px, -4px) scale(1.05) rotate(-2deg); }
        70%  { transform: translate(2px, -8px) scale(1.1) rotate(2deg); }
        75%  { transform: translate(-1px, -10px) scale(1.12) rotate(-1deg); }
        80%  { transform: translate(1px, -8px) scale(1.1) rotate(1deg); }
        85%  { transform: translate(0, -4px) scale(1.05) rotate(0deg); }
        90%  { transform: translate(0, -1px) scale(1.01); }
    }
`}</style>
        </div>
    );
}
