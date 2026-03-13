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

export default function Step2({ current, specimen, stone, biome }) {
    const [phase, setPhase] = useState("ANALYZING"); // ANALYZING, GENERATING, MINTING, READY
    const [analyzeResult, setAnalyzeResult] = useState(null);
    const [image, setImage] = useState(null);
    const [experimentId, setExperimentId] = useState(null);

    // Состояния UI
    const [progress, setProgress] = useState(0);
    const [displayed, setDisplayed] = useState("");
    const [previewUrl, setPreviewUrl] = useState("");

    // Состояния минта
    const [minting, setIsMinting] = useState(false);
    const [mintSuccess, setMintSuccess] = useState(false);
    const [mintError, setMintError] = useState(false);
    const [activeWallet, setActiveWallet] = useState(null);

    // Refs
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
        if (monitorRef.current) {
            monitorRef.current.scrollTop = monitorRef.current.scrollHeight;
        }
    }, [displayed, minting, mintSuccess, mintError]);

    useEffect(() => {
        return () => {
            audioLab.current.pause();
            audioPrinter.current.pause();
            sseRef.current?.close();
            mintSSERef.current?.close();
            clearTimeout(mintTimeoutRef.current);
        };
    }, []);

    async function runWorkflow() {
        audioLab.current.volume = 0.5;
        audioLab.current.play();

        try {
            const formData = new FormData();
            formData.append("file", specimen, "specimen.jpg");
            formData.append("biome", biome);
            formData.append("stone", stone.Type);

            const { Id } = await api.analyze(formData);
            await startSseSequence({ taskId: Id, mode: "ANALYZE" });
        } catch (err) {
            await appendTypedLine(`❌ ERROR: ${err.message || "Analysis failed"}`);
            throw new Error(`Workflow stopped: ${err.message}`);
        }
    }

    async function startSseSequence({ taskId, mode }) {
        return new Promise((resolve, reject) => {
            let localStep = 0;
            const TIMEOUT_MS = 180000;

            const timeout = setTimeout(() => {
                sseRef.current?.close();
                reject(new Error(`${mode} timeout`));
            }, TIMEOUT_MS);

            sseRef.current = api.subscribeSSE(taskId, {
                onEvent: async (event, data) => {
                    if (event === "progress") {
                        const p = data.progress;
                        if (mode === "ANALYZE") {
                            setProgress(p);
                            const targetStep = Math.floor(p / 10);
                            while (localStep < targetStep && localStep < progressMessages.length) {
                                appendTypedLine(progressMessages[localStep]);
                                localStep++;
                            }
                        } else {
                            // Режим GENERATE: выезжает back-карточка (снизу вверх)
                            if (backCardRef.current) {
                                backCardRef.current.style.transitionDuration = "500ms";
                                backCardRef.current.style.bottom = `-${100 - p}%`;
                            }
                        }
                    }

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

                            startSseSequence({ taskId: nextTask, mode: "GENERATE" }).then(resolve);
                        } else {
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
                        reject(new Error(data.error || "Task failed"));
                    }
                },
                onError: (err) => {
                    clearTimeout(timeout);
                    sseRef.current?.close();
                    reject(err);
                },
            });
        });
    }

    async function triggerAutoMint(expId) {
        setPhase("MINTING");
        if (backCardRef.current) {
            backCardRef.current.style.transitionDuration = "10000ms";
            backCardRef.current.style.bottom = "-100%";
        }
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
            setDisplayed((prev) => prev + `❌ ERROR: ${err.message}\n`);
        }
    }

    function showFrontCard() {
        audioPrinter.current.pause();
        if (frontCardRef.current) {
            frontCardRef.current.style.transitionDuration = "1500ms";
            frontCardRef.current.style.bottom = "0";
        }
    }

    function cleanupMint() {
        clearTimeout(mintTimeoutRef.current);
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

    const { bg, text, border } = BIOMES[biome] || {};

    return (
        <div className="flex flex-col h-full justify-end px-4">
            <div className="flex-1 flex items-center justify-center overflow-hidden">
                <img src={poster3Img} alt="poster" className="max-h-full max-w-full object-contain" />
            </div>

            <div className="relative w-full">
                {/* 1. monitor */}
                <div
                    className={`absolute text-xs text-lime-500 font-[monospace,emoji] leading-tight pointer-events-none`}
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
                        className={`absolute z-10 aspect-square rounded-full transition-colors ${progress >= val ? "bg-green-500/50" : "bg-transparent"}`}
                        style={{ top: `${81.1 - idx * 3.7}%`, left: "90.5%", width: "3%" }}
                    />
                ))}

                {/* 2. printer tray */}
                <div
                    className={`absolute z-20 overflow-hidden pointer-events-none`}
                    style={{ bottom: "56%", left: "15%", width: "62%", aspectRatio: "0.62/1" }}
                >
                    {/* Back Card: Analysis Report */}
                    <div
                        ref={backCardRef}
                        className={`w-full absolute ${text} text-xs p-1 transition-all ease-out`}
                        style={{ bottom: "-100%", aspectRatio: "0.62 / 1", fontSize: "10px" }}
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
                                <div className="px-1 leading-tight text-[10px]">
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
                        className={`w-full absolute ${text} text-xs p-1 transition-all ease-out`}
                        style={{
                            bottom: "-100%",
                            aspectRatio: "0.62 / 1",
                            animation: mintSuccess ? "shake 3s infinite" : "",
                        }}
                    >
                        <img className="absolute inset-0 w-full h-full" src={cardfrontImg} alt="card front" />
                        <div className="relative p-0.5 pb-5 w-full h-full">
                            <div className={`flex flex-col w-full h-full rounded-xl border-4 ${border} bg-orange-100`}>
                                <p className="uppercase text-center text-[6px]">
                                    borflab // <strong>top secret</strong>
                                </p>
                                <hr className={`border-0 h-0.5 ${bg}`} />
                                <div className="flex-grow flex p-1 relative">
                                    <img
                                        src={image ? `data:image/png;base64,${image}` : ""}
                                        className="m-auto h-full object-cover"
                                        style={{}}
                                    />
                                </div>
                                <hr className={`border-0 h-0.5 ${bg}`} />
                                <div className="p-1">
                                    <h1 className="font-bold text-[10px] uppercase truncate">
                                        {analyzeResult?.MONSTER_PROFILE?.name}
                                    </h1>
                                    <p className="text-[10px] italic leading-none mt-0.5">
                                        {analyzeResult?.MONSTER_PROFILE?.lore}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* indicators */}
                <div
                    className={`absolute z-10 aspect-square rounded-full transition-colors ${mintSuccess ? "bg-green-500/70" : "bg-transparent"}`}
                    style={{ top: `33.5%`, left: "88.7%", width: "3%" }}
                />
                <div
                    className={`absolute z-10 aspect-square rounded-full transition-colors ${mintError ? "bg-red-500/70" : "bg-transparent"}`}
                    style={{ top: `42.5%`, left: "88.7%", width: "3%" }}
                />

                {/* bg image */}
                <img src={transmutatorImg} alt="analyzer" className="w-full h-auto object-contain" />
            </div>
            <style>{`
                @keyframes scan { 0% { background-position: 0 -100px; } 100% { background-position: 0 100%; } }
                @keyframes shake {
                    0%, 70%, 100% { transform: translate(0, 0) rotate(0); }
                    75% { transform: translate(-1px, 1px) rotate(-1deg); }
                    80% { transform: translate(-2px, -1px) rotate(1deg); }
                    85% { transform: translate(2px, 1px) rotate(-1deg); }
                    90% { transform: translate(1px, -1px) rotate(1deg); }
                    95% { transform: translate(-1px, 2px) rotate(0); }
                }
            `}</style>
        </div>
    );
}
