import cardbackImg from "@images/card-back.png";
import cardfrontImg from "@images/card-front.png";
import poster3Img from "@images/poster03.png";
import transmutatorImg from "@images/transmutator.png";
import watermarkImg from "@images/watermark.png";
import { useWallets } from "@privy-io/react-auth/solana";
import labSound from "@sounds/lab.ogg";
import mintSound from "@sounds/mint.ogg";
import printerSound from "@sounds/printer.ogg";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api";
import store from "../store";

import { BIOMES, STONES } from "../config.js";

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
    const [bubble, setBubble] = useState(null);

    const monitorRef = useRef(null);
    const queueRef = useRef(Promise.resolve());
    const audioMint = useRef(new Audio(mintSound));
    const audioLab = useRef(new Audio(labSound));
    const audioPrinter = useRef(new Audio(printerSound));
    const hasStarted = useRef(false);
    const backCardRef = useRef(null);
    const frontCardRef = useRef(null);

    const phraseIndexRef = useRef(0); // оставляем, но используем иначе

    // Polling state
    const pollTimerRef = useRef(null); // current setTimeout handle
    const visibilityHandlerRef = useRef(null); // for cleanup
    const pollCancelledRef = useRef(false); // stop flag

    const { wallets } = useWallets();

    // ─── setup ────────────────────────────────────────────────────────────────

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

        // прогресс в фазе генерации идёт от P.Analyzed до 100
        // нормализуем в 0..1 относительно этого диапазона
        const PHASE_START = 15; // та же цифра что P.Analyzed на сервере, ~23
        const t = Math.min(Math.max((progress - PHASE_START) / (100 - PHASE_START), 0), 1);
        const translateY = 100 - t * 100;

        backCardRef.current.style.transitionDuration = "300ms";
        backCardRef.current.style.transform = `translateY(${translateY}%)`;
    }, [progress, phase]);

    // ─── audio ────────────────────────────────────────────────────────────────

    function stopAllAudio() {
        [audioLab, audioPrinter, audioMint].forEach((r) => {
            r.current.pause();
            r.current.currentTime = 0;
        });
    }

    function maybeAdvancePhrase(progress) {
        if (phraseIndexRef.current >= progressMessages.length) return;

        // каждая фраза занимает равный кусок прогресса
        const step = 100 / progressMessages.length;
        const expectedIndex = Math.floor(progress / step);

        while (phraseIndexRef.current <= expectedIndex && phraseIndexRef.current < progressMessages.length) {
            appendTypedLine(progressMessages[phraseIndexRef.current]);
            phraseIndexRef.current++;
        }
    }
    function pollTask(taskId, { onProgress, totalTimeoutMs = 180_000 } = {}) {
        return new Promise((resolve, reject) => {
            pollCancelledRef.current = false;
            const startTime = Date.now();
            const BASE_MS = 1000;
            const MAX_MS = 8000;
            let networkErrors = 0;

            const doPoll = async () => {
                if (pollCancelledRef.current) return;

                if (Date.now() - startTime > totalTimeoutMs) {
                    reject(new Error("Task timeout"));
                    return;
                }

                try {
                    const status = await api.getTaskStatus(taskId);
                    networkErrors = 0; // reset backoff on any successful HTTP response

                    if (status.progress != null) {
                        setProgress((prev) => Math.max(prev, status.progress));
                        maybeAdvancePhrase(status.progress);
                    }

                    if (status.failed) {
                        reject(new Error(status.error || "Task failed"));
                        return;
                    }

                    if (status.done) {
                        resolve({ result: status.result, nextTaskId: status.nextTaskId });
                        return;
                    }
                    pollTimerRef.current = setTimeout(doPoll, BASE_MS);
                } catch (err) {
                    networkErrors++;
                    const delay = Math.min(BASE_MS * Math.pow(2, networkErrors - 1), MAX_MS);
                    pollTimerRef.current = setTimeout(doPoll, delay);
                }
            };

            // When the user returns from another app / unlocks the phone,
            // fire immediately rather than waiting for the current timer.
            const onVisibilityChange = () => {
                if (document.visibilityState === "visible") {
                    clearTimeout(pollTimerRef.current);
                    doPoll();
                }
            };
            document.addEventListener("visibilitychange", onVisibilityChange);
            visibilityHandlerRef.current = onVisibilityChange;

            doPoll();
        });
    }

    function pollMintStatus(expId, { totalTimeoutMs = 90_000 } = {}) {
        return new Promise((resolve, reject) => {
            pollCancelledRef.current = false;
            const startTime = Date.now();
            const INTERVAL_MS = 2000;
            let networkErrors = 0;

            const doPoll = async () => {
                if (pollCancelledRef.current) return;

                if (Date.now() - startTime > totalTimeoutMs) {
                    reject(new Error("Mint timeout"));
                    return;
                }

                try {
                    const status = await api.getMintStatus(expId);
                    networkErrors = 0;

                    if (status.status === "confirmed") {
                        resolve();
                        return;
                    }
                    if (status.status === "failed") {
                        reject(new Error(status.error || "Mint failed"));
                        return;
                    }

                    pollTimerRef.current = setTimeout(doPoll, INTERVAL_MS);
                } catch (err) {
                    networkErrors++;
                    const delay = Math.min(INTERVAL_MS * Math.pow(2, networkErrors - 1), 8000);
                    pollTimerRef.current = setTimeout(doPoll, delay);
                }
            };

            const onVisibilityChange = () => {
                if (document.visibilityState === "visible") {
                    clearTimeout(pollTimerRef.current);
                    doPoll();
                }
            };
            document.addEventListener("visibilitychange", onVisibilityChange);
            visibilityHandlerRef.current = onVisibilityChange;

            doPoll();
        });
    }

    function stopPolling() {
        pollCancelledRef.current = true;
        clearTimeout(pollTimerRef.current);
        if (visibilityHandlerRef.current) {
            document.removeEventListener("visibilitychange", visibilityHandlerRef.current);
            visibilityHandlerRef.current = null;
        }
    }

    // ─── workflow ─────────────────────────────────────────────────────────────

    async function runWorkflow() {
        audioLab.current.volume = 0.5;
        audioLab.current.play();

        try {
            const formData = new FormData();
            formData.append("file", specimen, "specimen.jpg");
            formData.append("biome", biome);
            formData.append("stone", stone.Type);

            const { Id } = await api.analyze(formData);

            // ── analyze ───────────────────────────────────────────────────────
            const { result, nextTaskId } = await pollTask(Id);

            setAnalyzeResult(result);
            await appendTypedLine("Analysis complete.");
            await appendTypedLine("Starting transmutation...");

            setPhase("GENERATING");
            audioLab.current.pause();
            audioPrinter.current.loop = true;
            audioPrinter.current.volume = 0.5;
            audioPrinter.current.play();

            stopPolling(); // detach old visibility listener before next poll

            // ── generate ──────────────────────────────────────────────────────
            const { result: genResult } = await pollTask(nextTaskId);

            stopPolling();
            setProgress(100);
            await appendTypedLine("💶 Initializing uplink ✅");

            const { image: imgData, experimentId: expId } = genResult;
            setImage(imgData);
            setExperimentId(expId);

            await triggerAutoMint(expId);
        } catch (err) {
            stopPolling();
            stopAllAudio();
            appendTypedLine(`❌ ERROR: ${err.message || "Unknown error"}`);
        }
    }

    // ─── mint ─────────────────────────────────────────────────────────────────

    async function triggerAutoMint(expId) {
        setPhase("MINTING");
        audioPrinter.current.pause();
        audioPrinter.current.currentTime = 0;
        audioMint.current.loop = true;
        audioMint.current.volume = 0.3;
        audioMint.current.play();

        await handleMintAction(expId);
    }

    async function handleMintAction(expId) {
        if (!activeWallet) return;
        setIsMinting(true);

        try {
            // This call builds + sends the Solana tx server-side and returns fast.
            // The server then tracks confirmation in a goroutine.
            await api.prepareMonsterMint(expId, {
                userPubKey: activeWallet.address,
                stone: stone.Type,
            });

            // Poll the server for on-chain confirmation instead of a second SSE.
            await pollMintStatus(expId);

            stopPolling();
            setMintSuccess(true);
            setIsMinting(false);
            setPhase("READY");
            setDisplayed((prev) => prev + "SPIRAL INDEX REGISTERED ✅\n");
            showFrontCard();
        } catch (err) {
            stopPolling();
            stopAllAudio();
            setIsMinting(false);
            setMintError(true);
            setDisplayed((prev) => prev + `❌ ${err.message}\n`);
        }
    }

    // ─── card reveal ──────────────────────────────────────────────────────────

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

    // ─── typed output ─────────────────────────────────────────────────────────

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

    // ─── render ───────────────────────────────────────────────────────────────

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
                    <div ref={monitorRef} className="overflow-auto h-full">
                        <p>BORFLAB 37.987-B</p>
                        <p>Progress... {progress}%</p>
                        <span className="whitespace-pre-wrap">{displayed}</span>

                        {minting && <div className="text-orange-400 animate-pulse mt-1">Securing on chain...</div>}
                        {mintError && <div className="text-red-500 font-bold mt-1">[!] CRITICAL_MINT_FAILURE</div>}
                        {mintSuccess && (
                            <div className="p-1 border border-primary/50 bg-lime-900/20 pointer-events-auto">
                                <Link
                                    to="/library"
                                    className="text-primary underline decoration-dotted hover:text-white transition-colors block"
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
                        className={`box-border w-full absolute ${text} p-1 transition-all ease-out`}
                        style={{ transform: "translateY(100%)", aspectRatio: "0.62 / 1" }}
                    >
                        <img className="absolute inset-0 w-full h-full" src={cardbackImg} alt="card back" />
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
                            <img className="absolute inset-0 w-full h-full" src={cardfrontImg} alt="card front" />
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
                                                src={`data:image/png;base64,${image}`}
                                                className="max-h-full max-w-full w-auto h-auto object-contain mr-auto ml-auto z-10"
                                                style={{
                                                    animation: mintSuccess ? "escape 3.5s infinite" : "",
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
