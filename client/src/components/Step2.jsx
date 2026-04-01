import cardbackImg from "@images/card-back.png";
import cardfrontImg from "@images/card-front.png";
import poster3Img from "@images/poster03.png";
import transmutatorImg from "@images/transmutator.png";
import { useWallets } from "@privy-io/react-auth/solana";
import labSound from "@sounds/lab.ogg";
import printerSound from "@sounds/printer.ogg";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api";

import { BIOMES, STONES } from "../config.js";

// ─── КОНСТАНТЫ ВРЕМЕНИ ────────────────────────────────────────────
const ANALYZE_DURATION_MS = 15_000;
const GENERATE_DURATION_MS = 45_000;
const PHRASE_INTERVAL_MS = 4_000;
const ANALYZE_PROGRESS_END = 20;
const GENERATE_PROGRESS_END = 95;
const ANALYZE_PHRASE_COUNT = 2;
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
    const [phase, setPhase] = useState("ANALYZING");
    const [analyzeResult, setAnalyzeResult] = useState(null);
    const [image, setImage] = useState(null);
    const [experimentId, setExperimentId] = useState(null);

    const [progress, setProgress] = useState(0);
    const [displayed, setDisplayed] = useState("");
    const [previewUrl, setPreviewUrl] = useState("");

    const [minting, setIsMinting] = useState(false);
    const [mintSuccess, setMintSuccess] = useState(false);
    const [mintError, setMintError] = useState(false);
    const [activeWallet, setActiveWallet] = useState(null);
    const [bubble, setBubble] = useState(null); // null | string

    const monitorRef = useRef(null);
    const sseRef = useRef(null);
    const queueRef = useRef(Promise.resolve());
    const audioLab = useRef(new Audio(labSound));
    const audioPrinter = useRef(new Audio(printerSound));
    const hasStarted = useRef(false);
    const backCardRef = useRef(null);
    const frontCardRef = useRef(null);
    const mintSSERef = useRef(null);
    const mintTimeoutRef = useRef(null);
    const progressAnimRef = useRef(null);
    const phraseTimerRef = useRef(null);
    const phraseIndexRef = useRef(0);

    const { wallets } = useWallets();

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

    useEffect(() => {
        if (current === 1 && !hasStarted.current) {
            if (!specimen || !biome || !stone) {
                throw new Error(
                    `Incomplete data for transmutation: ${JSON.stringify({ specimen: !!specimen, biome, stone: !!stone })}`
                );
            }
            hasStarted.current = true;
            runWorkflow();
        }
    }, [current, specimen, biome, stone]);

    useEffect(() => {
        if (!mintSuccess) return;

        const interval = setInterval(() => {
            const phrase = monsterPhrases[Math.floor(Math.random() * monsterPhrases.length)];
            setBubble(phrase);
            setTimeout(() => setBubble(null), 2000);
        }, 7000);

        return () => clearInterval(interval);
    }, [mintSuccess]);

    useEffect(() => {
        if (monitorRef.current) {
            monitorRef.current.scrollTop = monitorRef.current.scrollHeight;
        }
    }, [displayed, minting, mintSuccess, mintError]);

    useEffect(() => {
        if (phase !== "GENERATING" && phase !== "MINTING") return;
        if (!backCardRef.current) return;

        const rangeStart = ANALYZE_PROGRESS_END;
        const rangeEnd = GENERATE_PROGRESS_END;

        const clamped = Math.min(Math.max(progress, rangeStart), rangeEnd);
        const t = (clamped - rangeStart) / (rangeEnd - rangeStart); // 0..1
        const translateY = 100 - t * 100; // 100%..0%

        backCardRef.current.style.transitionDuration = "300ms";
        backCardRef.current.style.transform = `translateY(${translateY}%)`;
    }, [progress, phase]);

    useEffect(() => {
        return () => {
            stopAllTimers();
            audioLab.current.pause();
            audioPrinter.current.pause();
            sseRef.current?.close();
            mintSSERef.current?.close();
            clearTimeout(mintTimeoutRef.current);
        };
    }, []);

    function stopAllAudio() {
        audioLab.current.pause();
        audioPrinter.current.pause();
        audioLab.current.currentTime = 0;
        audioPrinter.current.currentTime = 0;
    }

    function stopAllTimers() {
        clearInterval(progressAnimRef.current);
        clearInterval(phraseTimerRef.current);
    }

    function startProgressAnimation(fromPct, toPct, durationMs) {
        const startTime = Date.now();

        clearInterval(progressAnimRef.current);
        progressAnimRef.current = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const t = Math.min(elapsed / durationMs, 1);
            const eased = 1 - Math.pow(1 - t, 2); // ease-out
            const current = fromPct + (toPct - fromPct) * eased;
            setProgress(Math.round(current));

            if (t >= 1) clearInterval(progressAnimRef.current);
        }, 100);
    }

    function startPhrases(fromIndex, count) {
        clearInterval(phraseTimerRef.current);
        phraseIndexRef.current = fromIndex;

        phraseTimerRef.current = setInterval(() => {
            const idx = phraseIndexRef.current;
            if (idx < fromIndex + count && idx < progressMessages.length) {
                appendTypedLine(progressMessages[idx]);
                phraseIndexRef.current++;
            } else {
                clearInterval(phraseTimerRef.current);
            }
        }, PHRASE_INTERVAL_MS);
    }

    async function runWorkflow() {
        audioLab.current.volume = 0.5;
        audioLab.current.play();

        startProgressAnimation(0, ANALYZE_PROGRESS_END, ANALYZE_DURATION_MS);
        startPhrases(0, ANALYZE_PHRASE_COUNT);

        try {
            const formData = new FormData();
            formData.append("file", specimen, "specimen.jpg");
            formData.append("biome", biome);
            formData.append("stone", stone.Type);

            const { Id } = await api.analyze(formData);
            await startSseSequence({ taskId: Id, mode: "ANALYZE" });
        } catch (err) {
            stopAllTimers();
            stopAllAudio();
            appendTypedLine(`❌ ERROR: ${err.message || "Unknown error"}`);
        }
    }

    async function startSseSequence({ taskId, mode }) {
        return new Promise((resolve, reject) => {
            const TIMEOUT_MS = 180000;

            const timeout = setTimeout(() => {
                sseRef.current?.close();
                reject(new Error(`${mode} timeout`));
            }, TIMEOUT_MS);

            sseRef.current = api.subscribeSSE(taskId, {
                onEvent: async (event, data) => {
                    if (event === "done") {
                        clearTimeout(timeout);
                        sseRef.current?.close();

                        if (mode === "ANALYZE") {
                            const { result, nextTask } = data;
                            setAnalyzeResult(result);
                            await appendTypedLine("Analysis complete.");
                            await appendTypedLine("Starting transmutation...");

                            setPhase("GENERATING");
                            audioLab.current.pause();
                            audioPrinter.current.loop = true;
                            audioPrinter.current.volume = 0.5;
                            audioPrinter.current.play();

                            startProgressAnimation(ANALYZE_PROGRESS_END, GENERATE_PROGRESS_END, GENERATE_DURATION_MS);
                            startPhrases(ANALYZE_PHRASE_COUNT, progressMessages.length - ANALYZE_PHRASE_COUNT);

                            try {
                                await startSseSequence({ taskId: nextTask, mode: "GENERATE" });
                                resolve();
                            } catch (err) {
                                reject(err);
                            }
                        } else {
                            stopAllTimers();
                            setProgress(100);

                            await appendTypedLine("💶 Initializing uplink ✅");
                            const { image: imgData, experimentId: expId } = data;
                            setImage(imgData);
                            setExperimentId(expId);

                            triggerAutoMint(expId);
                            resolve();
                        }
                    }

                    if (event === "failed") {
                        clearTimeout(timeout);
                        sseRef.current?.close();
                        stopAllTimers();
                        stopAllAudio();
                        reject(new Error(data.error || "Task failed"));
                    }
                },
                onError: (err) => {
                    clearTimeout(timeout);
                    sseRef.current?.close();
                    stopAllTimers();
                    stopAllAudio();
                    reject(err);
                },
            });
        });
    }

    async function triggerAutoMint(expId) {
        setPhase("MINTING");
        handleMintAction(expId);
    }

    async function handleMintAction(expId) {
        if (!activeWallet) return;
        setIsMinting(true);

        try {
            mintTimeoutRef.current = setTimeout(() => {
                mintSSERef.current?.close();
                setIsMinting(false);
                setMintError(true);
                setDisplayed((prev) => prev + "❌ UPLINK TIMEOUT\n");
            }, 60000);

            mintSSERef.current = api.subscribeSSE(activeWallet.address, {
                onEvent: (event) => {
                    if (event === "confirmed") {
                        setMintSuccess(true);
                        setIsMinting(false);
                        setPhase("READY");
                        setDisplayed((prev) => prev + "SPIRAL INDEX REGISTERED ✅\n");
                        cleanupMint();
                        showFrontCard();
                    }
                    if (event === "failed") {
                        setMintError(true);
                        setIsMinting(false);
                        setDisplayed((prev) => prev + "❌ CHAIN REJECTED\n");
                        cleanupMint();
                    }
                },
            });

            await api.prepareMonsterMint(expId, {
                userPubKey: activeWallet.address,
                stone: stone.Type,
            });
        } catch (err) {
            setIsMinting(false);
            stopAllAudio();
            setDisplayed((prev) => prev + `❌ ERROR: ${err.message}\n`);
        }
    }

    function showFrontCard() {
        audioPrinter.current.pause();

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

    function cleanupMint() {
        clearTimeout(mintTimeoutRef.current);
        stopAllAudio();
        mintSSERef.current?.close();
    }

    async function appendTypedLine(line) {
        if (!line) return;
        queueRef.current = queueRef.current.then(async () => {
            for (let i = 0; i < line.length; i++) {
                setDisplayed((prev) => prev + line[i]);
                await new Promise((r) => setTimeout(r, 20));
            }
            setDisplayed((prev) => prev + "\n");
        });
        return queueRef.current;
    }

    const { bg, text, border } = BIOMES[biome] || {};

    return (
        <div className="flex flex-col h-full justify-end px-4">
            <div className="flex-1 flex items-center justify-center overflow-hidden">
                <img src={poster3Img} alt="poster" className="max-h-full max-w-full object-contain" />
            </div>

            <div className="relative w-full">
                {/* monitor */}
                <div
                    className="absolute text-xs text-lime-500 font-[monospace,emoji] leading-tight"
                    style={{ top: "56%", left: "12%", width: "67%", aspectRatio: "1 / 0.6" }}
                >
                    <div className="absolute inset-0 pointer-events-none bg-no-repeat bg-[linear-gradient(180deg,rgba(0,255,0,0)_0%,rgba(0,255,0,0.8)_50%,rgba(0,255,0,0)_100%)] bg-[length:100%_6%] animate-[scan_2.5s_linear_infinite] opacity-70 mix-blend-screen" />
                    <div ref={monitorRef} className="overflow-auto h-full">
                        <p>BORFLAB 37.987-B</p>
                        <p>Progress... {progress}%</p>
                        <span className="whitespace-pre-wrap">{displayed}</span>

                        {minting && <div className="text-orange-400 animate-pulse mt-1">Securing on chain...</div>}
                        {mintError && <div className="text-red-500 font-bold mt-1">[!] CRITICAL_MINT_FAILURE</div>}
                        {mintSuccess && (
                            <div className="p-1 border border-lime-500/50 bg-lime-900/20 pointer-events-auto">
                                <Link
                                    to="/library"
                                    className="text-lime-500 underline decoration-dotted hover:text-white transition-colors block"
                                >
                                    &gt; ACCESS_LIBRARY.exe
                                </Link>
                            </div>
                        )}
                        <span className="animate-pulse">▋</span>
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
                    className="absolute z-20 overflow-hidden pointer-events-none"
                    style={{ bottom: "56.5%", left: "15%", width: "62%", aspectRatio: "0.62/1" }}
                >
                    {/* Back Card: Analysis Report */}
                    <div
                        ref={backCardRef}
                        className={`box-border w-full absolute ${text} text-xs p-1 transition-all ease-out`}
                        style={{ transform: "translateY(100%)", aspectRatio: "0.62 / 1", fontSize: "10px" }}
                    >
                        <img className="absolute inset-0 w-full h-full" src={cardbackImg} alt="card back" />
                        <div className="relative p-0.5 pb-5 w-full h-full">
                            <div
                                className={`relative flex flex-col border-4 rounded-xl w-full h-full ${border} bg-orange-100`}
                            >
                                <p className="p-px text-center uppercase">Specimen Analysis</p>
                                <hr className={`border-0 h-0.5 ${bg}`} />
                                <div className="flex w-full items-center">
                                    <div className="h-20 w-8/12 flex">
                                        {previewUrl && (
                                            <img src={previewUrl} className="m-auto rounded h-full object-cover" />
                                        )}
                                    </div>
                                    <div className={`w-0.5 h-full ${bg}`} />
                                    <div className="py-1 w-4/12 flex flex-col gap-1">
                                        <img src={STONES[stone?.Type]?.image} className="object-cover" />
                                        <strong className="mx-1 text-center uppercase py-px bg-red-800 text-white">
                                            common
                                        </strong>
                                    </div>
                                </div>
                                <hr className={`border-0 h-0.5 ${bg}`} />
                                <div className="px-1 leading-tight text-[9px]">
                                    <p>
                                        <strong>BORFOLOGIST:</strong> PSM-001
                                    </p>
                                    <hr className={`border-0 h-0.5 ${bg}`} />
                                    <p>
                                        <strong>SPIRAL:</strong> {`[${biome}]`}
                                    </p>
                                    <hr className={`border-0 h-0.5 ${bg}`} />
                                    <p>
                                        <strong>MOVE:</strong> {analyzeResult?.MONSTER_PROFILE?.movement_class}
                                    </p>
                                    <hr className={`border-0 h-0.5 ${bg}`} />
                                    <p>
                                        <strong>BEHAVIOUR:</strong> {analyzeResult?.MONSTER_PROFILE?.behaviour}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Front Card: Result */}
                    <div
                        ref={frontCardRef}
                        className={`box-border w-full absolute ${text} text-xs p-1 transition-all ease-out pointer-events-auto`}
                        style={{ transform: "translateY(100%)", aspectRatio: "0.62 / 1" }}
                    >
                        <Link to="/library">
                            <img className="absolute inset-0 w-full h-full" src={cardfrontImg} alt="card front" />
                            <div className="relative p-0.5 pb-5 w-full h-full">
                                <div
                                    className={`flex flex-col w-full h-full rounded-xl border-4 ${border} bg-orange-100`}
                                >
                                    <p className="uppercase text-center text-[6px]">
                                        borflab // <strong>top secret</strong>
                                    </p>
                                    <hr className={`border-0 h-0.5 ${bg}`} />
                                    {/* в блоке с картинкой монстра — убрать overflow-hidden с родителя */}
                                    <div className="flex-grow flex p-1 relative overflow-visible">
                                        {image && (
                                            <div className="relative h-full">
                                                {/* комикс-бабл */}
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
                                                    src={`data:image/png;base64,${image}`}
                                                    className="mx-auto h-full w-full object-contain"
                                                    style={{
                                                        animation: mintSuccess ? "escape 3.5s infinite" : "",
                                                    }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                    <hr className={`border-0 h-0.5 ${bg}`} />
                                    <div className="p-1">
                                        <h1 className="font-bold text-[10px] uppercase truncate">
                                            {analyzeResult?.MONSTER_PROFILE?.name}
                                        </h1>
                                        <p className="text-[9px] italic leading-none mt-0.5">
                                            {analyzeResult?.MONSTER_PROFILE?.lore}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </Link>
                    </div>
                </div>

                {/* mint status indicators */}
                <div
                    className={`absolute z-10 aspect-square rounded-full transition-colors ${
                        mintSuccess ? "bg-green-500/70" : "bg-transparent"
                    }`}
                    style={{ top: "33.5%", left: "88.7%", width: "3%" }}
                />
                <div
                    className={`absolute z-10 aspect-square rounded-full transition-colors ${
                        mintError ? "bg-red-500/70" : "bg-transparent"
                    }`}
                    style={{ top: "42.5%", left: "88.7%", width: "3%" }}
                />

                {/* bg image */}
                <img src={transmutatorImg} alt="analyzer" className="w-full h-auto object-contain" />
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
