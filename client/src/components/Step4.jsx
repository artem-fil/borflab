import { Connection, Transaction } from "@solana/web3.js";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import posterImg from "@images/poster.png";
import printerImg from "@images/printer.png";
import cardbackImg from "@images/card-back.png";
import cardfrontImg from "@images/card-front.png";
import printerSound from "@sounds/printer.ogg";
import api from "../api";
import { Link } from "react-router-dom";
import { useWallets, useSignTransaction } from "@privy-io/react-auth/solana";

import { ENDPOINT, STONES, BIOMES } from "../config.js";

export default function Step4({ specimen, stone, biome, analyzeResult, nextTask }) {
    const { wallets } = useWallets();
    const { signTransaction } = useSignTransaction();
    const [done, setDone] = useState(false);
    const [preparing, setIsPreparing] = useState(false);
    const [minting, setIsMinting] = useState(false);
    const [mintSuccess, setMintSuccess] = useState(false);
    const [mintError, setMintError] = useState(false);
    const frontCardRef = useRef(null);
    const backCardRef = useRef(null);
    const printerIndicatorRef = useRef(null);
    const outputImageRef = useRef(null);
    const sseRef = useRef(null);
    const mintSSERef = useRef(null);
    const mintTimeoutRef = useRef(null);
    const mintFinishedRef = useRef(false);
    const [previewUrl, setPreviewUrl] = useState("");

    const audioRef = useRef(new Audio(printerSound));
    audioRef.current.volume = 0.5;

    useEffect(() => {
        if (!nextTask) return;
        subscribeGenerateProgress(nextTask);
    }, [nextTask]);

    function subscribeGenerateProgress(generateTaskId) {
        setTimeout(() => {
            audioRef.current.play();
        }, 1500);
        const TIMEOUT_MS = 3 * 60 * 1000;
        let timeout = null;

        const clearAll = () => {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            if (timeout) {
                clearTimeout(timeout);
                timeout = null;
            }
            sseRef.current?.close();
            sseRef.current = null;
        };

        timeout = setTimeout(() => {
            clearAll();
            alert("⚠️ Analysis timeout. The creature refused to draw.");
        }, TIMEOUT_MS);

        sseRef.current = api.subscribeSSE(generateTaskId, {
            onEvent: async (event, data) => {
                if (event === "progress") {
                    const { progress } = data;

                    if (backCardRef.current) {
                        backCardRef.current.style.bottom = `-${progress}%`;
                    }
                }

                if (event === "done") {
                    clearAll();

                    const { image, experimentId } = data;

                    setDone(true);

                    if (backCardRef.current) {
                        backCardRef.current.style.bottom = `-100%`;
                    }

                    if (frontCardRef.current) {
                        frontCardRef.current.style.bottom = `0`;
                        frontCardRef.current.onclick = () => handleMintClick(experimentId);
                    }

                    if (printerIndicatorRef.current) {
                        printerIndicatorRef.current.style.animation = "none";
                    }

                    if (outputImageRef.current) {
                        outputImageRef.current.setAttribute("src", `data:image/png;base64,${image}`);
                    }
                }

                if (event === "failed") {
                    clearAll();
                    const { error } = data;
                    alert(error);
                }
            },

            onError: (err) => {
                clearAll();
                console.error("SSE error", err);
            },
        });
    }

    useEffect(() => {
        if (!specimen) return;

        if (!(specimen instanceof Blob)) {
            console.error("specimen is not a Blob:", specimen);
            return;
        }

        const url = URL.createObjectURL(specimen);
        setPreviewUrl(url);

        return () => URL.revokeObjectURL(url);
    }, [specimen]);

    async function handleMintClick(experimentId) {
        if (minting || preparing) return;

        try {
            setIsPreparing(true);
            const storedWallet = localStorage.getItem("primaryWallet");
            const solanaWallet = wallets.find((w) => w.address === storedWallet) || wallets[0];

            const { TxBase64 } = await api.prepareMonsterMint(experimentId, {
                userPubKey: solanaWallet.address,
                stonePubKey: stone.MintAddress,
            });

            const txBytes = Uint8Array.from(atob(TxBase64), (c) => c.charCodeAt(0));
            const transaction = Transaction.from(txBytes);

            const serializedTx = transaction.serialize({
                requireAllSignatures: false,
                verifySignatures: false,
            });
            setIsPreparing(false);
            const { signedTransaction } = await signTransaction({
                wallet: solanaWallet,
                transaction: new Uint8Array(serializedTx),
                chain: "solana:devnet",
            });

            const connection = new Connection(ENDPOINT, "confirmed");
            const txid = await connection.sendRawTransaction(signedTransaction);

            setIsMinting(true);

            mintTimeoutRef.current = setTimeout(() => {
                console.warn("⏰ Mint SSE timeout");
                mintSSERef.current?.close();
                mintSSERef.current = null;
            }, 60000);

            mintSSERef.current = api.subscribeSSE(txid, {
                onEvent: (event, data) => {
                    if (event === "confirmed") {
                        setMintSuccess(true);
                        cleanupMint();
                        console.log("🎉 Mint successful!", data);
                    }

                    if (event === "failed") {
                        setMintError(true);
                        cleanupMint();
                        console.error("❌ Mint failed", data);
                    }
                },
            });
        } catch (err) {
            console.error("❌ Transaction failed:", err);
        }
    }

    function cleanupMint() {
        clearTimeout(mintTimeoutRef.current);
        mintTimeoutRef.current = null;
        mintSSERef.current?.close();
        mintSSERef.current = null;
        mintFinishedRef.current = true;
    }

    if (!biome) {
        return;
    }
    const { bg, text, border } = BIOMES[biome];

    return (
        <div className="flex flex-col h-full justify-end">
            <div className="flex-1 flex items-center justify-center overflow-hidden">
                <img src={posterImg} alt="poster" className="max-h-full max-w-full object-contain" />
            </div>

            <div className="relative w-full">
                {/* printer tray */}
                <div
                    className="absolute z-10 overflow-hidden"
                    style={{ bottom: "25%", left: "15%", width: "62%", aspectRatio: "0.62/1" }}
                >
                    {/* back card */}
                    <div
                        ref={backCardRef}
                        className={`w-full absolute ${text} text-xs p-1 transition-all ease-out`}
                        style={{
                            bottom: "0",
                            transitionDuration: "2000ms",
                            aspectRatio: "0.62 / 1",
                            fontSize: "8px",
                        }}
                    >
                        <img className="absolute inset-0 w-full h-full" src={cardbackImg} alt="card back" />
                        <div className="relative p-0.5 pb-5 rounded-xl w-full h-full">
                            <div
                                className={`relative flex flex-col border-4 rounded-xl w-full outline-4 outline-orange-100 h-full ${border} bg-orange-100`}
                            >
                                <p className="p-1 leading-tight text-center">SPECIMEN ANALYSIS LOG // DEPT:006</p>
                                <hr className={`border-0 h-0.5 ${bg}`} />
                                <div className="flex w-full items-center">
                                    <div className="h-20 w-8/12 flex flex-col">
                                        <img
                                            src={previewUrl}
                                            className="ml-auto mr-auto rounded h-full object-cover"
                                            alt="input image"
                                        />
                                    </div>
                                    <div className={`border-0 w-0.5 h-full ${bg}`} />
                                    <div className="py-1 w-4/12 flex flex-col gap-1">
                                        <img
                                            src={STONES[stone?.Type]?.image}
                                            className=" object-cover"
                                            alt="borfstone"
                                        />
                                        <strong className="mx-1 text-center uppercase py-1 bg-red-800 text-white">
                                            common
                                        </strong>
                                    </div>
                                </div>
                                <hr className={`border-0 h-0.5 ${bg}`} />
                                <p className="leading-tight px-1">
                                    <strong className="uppercase">BORFOLOGIST ID: </strong>
                                    {`# PSM-0000001-25/I`}
                                </p>
                                <hr className={`border-0 h-0.5 ${bg}`} />
                                <p className="leading-tight px-1">
                                    <strong className="uppercase">spiral index: </strong>
                                    {`[23/840K BORF’S][3/164.4K ${stone?.Type}][${biome}: 001]`}
                                </p>
                                <hr className={`border-0 h-0.5 ${bg}`} />
                                <p className="leading-tight px-1">
                                    <strong className="uppercase">issue date: </strong>
                                    {new Date().toLocaleDateString()}
                                </p>
                                <strong className={`py-0.5 ${bg} text-white uppercase`}>[borf profile]</strong>
                                <p className="leading-tight px-1">
                                    <strong className="uppercase">movement class:</strong>
                                    {analyzeResult?.MONSTER_PROFILE?.movement_class}
                                </p>
                                <hr className={`border-0 h-0.5 ${bg}`} />
                                <p className="leading-tight px-1">
                                    <strong className="uppercase">behaviour:</strong>
                                    {analyzeResult?.MONSTER_PROFILE?.behaviour}
                                </p>
                                <hr className={`border-0 h-0.5 ${bg}`} />
                                <p className="leading-tight px-1">
                                    <strong className="uppercase">personality:</strong>
                                    {analyzeResult?.MONSTER_PROFILE?.personality}
                                </p>
                                <hr className={`border-0 h-0.5 ${bg}`} />
                                <p className="leading-tight px-1">
                                    <strong className="uppercase">abilities:</strong>
                                    {analyzeResult?.MONSTER_PROFILE?.abilities}
                                </p>
                                <hr className={`border-0 h-0.5 ${bg}`} />
                                <p className="leading-tight px-1">
                                    <strong className="uppercase">habitat:</strong>
                                    {analyzeResult?.MONSTER_PROFILE?.habitat}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* front card */}
                    <div
                        ref={frontCardRef}
                        className={`w-full absolute ${text} text-xs p-1 transition-all ease-out`}
                        style={{
                            bottom: "-100%",
                            transitionDuration: "2000ms",
                            aspectRatio: "0.62 / 1",
                            fontSize: "8px",
                        }}
                    >
                        <img className="absolute inset-0 w-full h-full" src={cardfrontImg} alt="card front" />
                        <div className="relative p-0.5 pb-5 w-full h-full">
                            <div className={`flex flex-col w-full h-full rounded-xl border-4 ${border} bg-orange-100`}>
                                <p className="uppercase text-center">
                                    borflab // <strong>top secret</strong> // specimen
                                </p>
                                <hr className={`border-0 h-0.5 ${bg}`} />
                                <div className="flex-grow flex overflow-hidden p-1">
                                    <img
                                        ref={outputImageRef}
                                        className="mr-auto ml-auto h-full object-cover"
                                        alt="output"
                                    />
                                </div>
                                <hr className={`border-0 h-0.5 ${bg}`} />
                                <div className="flex justify-between p-0.5">
                                    <div className="flex flex-col justify-between">
                                        <h1 className="leading-tight uppercase font-bold text-lg">
                                            {analyzeResult?.MONSTER_PROFILE?.name}
                                        </h1>
                                        <p className="uppercase leading-tight text-sm">
                                            species: <strong>{analyzeResult?.MONSTER_PROFILE?.species}</strong>
                                        </p>
                                    </div>
                                    <div className={`border-2 ${border}`}>
                                        <h1 className="px-0.5 text-lg font-bold text-center">I</h1>
                                        <hr className={`border-0 h-0.5 ${bg}`} />
                                        <span className="px-0.5">chapter</span>
                                    </div>
                                </div>
                                <p className={`p-0.5 text-sm uppercase text-gray-100 ${bg}`}>
                                    biome: <strong className="font-bold text-orange-400">{biome}</strong>
                                </p>
                                <p className="leading-tight px-0.5">
                                    <strong className="uppercase">observation: </strong>
                                    {analyzeResult?.MONSTER_PROFILE?.lore}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* indicator */}
                <div
                    ref={printerIndicatorRef}
                    className={`absolute z-10 aspect-square rounded-full ${done ? "" : "animate-pulse-button"}`}
                    style={{
                        top: "64.4%",
                        left: "87.8%",
                        width: "3%",
                    }}
                />
                <img src={printerImg} alt="igniter" className="w-full h-auto object-contain" />
            </div>
            {preparing &&
                createPortal(
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
                        <div className="flex flex-col items-center text-white text-lg p-4 rounded-md bg-black/80">
                            <svg
                                className="animate-spin h-10 w-10 mb-4 text-white"
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                                />
                            </svg>
                            <span>Preparing...</span>
                        </div>
                    </div>,
                    document.body
                )}
            {minting &&
                createPortal(
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
                        {mintFinishedRef.current ? (
                            <div className="flex flex-col items-center text-white text-lg p-4 rounded-md bg-black/80">
                                {mintSuccess && (
                                    <div className="flex flex-col items-center">
                                        <span className="text-green-400 font-bold">🥳 Minted successfully!</span>
                                        <Link to={`/library`}>Check monster 👉</Link>
                                    </div>
                                )}
                                {mintError && <div className="text-red-400 font-bold">😖 Mint failed!</div>}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center text-white text-lg p-4 rounded-md bg-black/80">
                                <svg
                                    className="animate-spin h-10 w-10 mb-4 text-white"
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        className="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                                    />
                                </svg>
                                <span>Minting...</span>
                            </div>
                        )}
                    </div>,
                    document.body
                )}
        </div>
    );
}
