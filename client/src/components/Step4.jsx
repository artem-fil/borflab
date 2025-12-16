import { Connection, Transaction } from "@solana/web3.js";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import posterImg from "../assets/poster.png";
import printerImg from "../assets/printer.png";
import cardbackImg from "../assets/card-back.png";
import cardfrontImg from "../assets/card-front.png";
import api from "../api";
import { useNavigate, Link } from "react-router-dom";
import { useWallets, useSignTransaction } from "@privy-io/react-auth/solana";

import { ENDPOINT, STONES } from "../config.js";

export default function Step4({ specimen, stone, biome, analyzeResult, nextTask }) {
    const { wallets } = useWallets();
    const { signTransaction } = useSignTransaction();
    const solanaWallet = wallets[0];
    const [done, setDone] = useState(false);
    const [minting, setIsMinting] = useState(false);
    const [mintSuccess, setMintSuccess] = useState(false);
    const [mintError, setMintError] = useState(false);
    const navigate = useNavigate();
    const frontCardRef = useRef(null);
    const backCardRef = useRef(null);
    const printerIndicatorRef = useRef(null);
    const outputImageRef = useRef(null);
    const mintSSERef = useRef(null);
    const mintTimeoutRef = useRef(null);
    const mintFinishedRef = useRef(false);

    useEffect(() => {
        if (!nextTask) return;

        pollGenerateProgress(nextTask);
    }, [nextTask]);

    useEffect(() => {
        return () => {
            mintSSERef.current?.close();
            mintSSERef.current = null;

            clearTimeout(mintTimeoutRef.current);
            mintTimeoutRef.current = null;
        };
    }, []);

    async function pollGenerateProgress(generateTaskId) {
        const BASE_DELAY = 1500;
        let pollingCancelled = false;

        const timeout = setTimeout(() => {
            pollingCancelled = true;
            alert("⚠️ Analysis timeout. The creature refused to draw.");
        }, 3 * 60 * 1000);

        async function poll() {
            try {
                const { progress, done, result, error } = await api.progress(generateTaskId);
                if (backCardRef.current) {
                    backCardRef.current.style.bottom = `-${progress}%`;
                }

                if (error) {
                    clearTimeout(timeout);
                    throw error;
                }
                if (done) {
                    const { image, experimentId } = result;
                    setDone(done);
                    clearTimeout(timeout);

                    if (frontCardRef.current) {
                        frontCardRef.current.style.bottom = `0`;
                        frontCardRef.current.onclick = async () => {
                            if (minting) {
                                return;
                            }
                            try {
                                const { TxBase64 } = await api.prepareMonsterMint(experimentId, {
                                    userPubKey: solanaWallet.address,
                                    stonePubKey: stone.MintAddress,
                                });

                                function base64ToUint8Array(base64) {
                                    const raw = atob(base64);
                                    const array = new Uint8Array(raw.length);
                                    for (let i = 0; i < raw.length; i++) {
                                        array[i] = raw.charCodeAt(i);
                                    }
                                    return array;
                                }

                                const txBytes = base64ToUint8Array(TxBase64);
                                const transaction = Transaction.from(txBytes);

                                const serializedTx = transaction.serialize({
                                    requireAllSignatures: false,
                                    verifySignatures: false,
                                });
                                const txUint8Array = new Uint8Array(serializedTx);

                                const { signedTransaction } = await signTransaction({
                                    wallet: solanaWallet,
                                    transaction: txUint8Array,
                                    chain: "solana:devnet",
                                });

                                console.log("🚀 Sending transaction...");
                                const connection = new Connection(ENDPOINT, "confirmed");

                                const txid = await connection.sendRawTransaction(signedTransaction);

                                setIsMinting(true);

                                mintTimeoutRef.current && clearTimeout(mintTimeoutRef.current);

                                mintTimeoutRef.current = setTimeout(() => {
                                    console.warn("⏰ Mint SSE timeout");
                                    mintSSERef.current?.close();
                                    mintSSERef.current = null;
                                    console.error("Mint is taking longer than usual. Check your library later ");
                                }, 60000);

                                mintSSERef.current?.close();
                                mintSSERef.current = null;

                                mintSSERef.current = api.checkMonsterMint(txid, {
                                    onMessage: ({ Status, Data }) => {
                                        if (Status === "confirmed") {
                                            setMintSuccess(true);
                                            mintFinishedRef.current = true;
                                            clearTimeout(mintTimeoutRef.current);
                                            mintTimeoutRef.current = null;
                                            mintSSERef.current?.close();
                                            mintSSERef.current = null;

                                            console.log("🎉 Server confirmed mint!", Data);
                                            console.log("🎉 Mint successful!");
                                        }

                                        if (Status === "failed") {
                                            setMintError(true);
                                            mintFinishedRef.current = true;
                                            clearTimeout(mintTimeoutRef.current);
                                            mintTimeoutRef.current = null;
                                            mintSSERef.current?.close();
                                            mintSSERef.current = null;
                                            console.error("❌ Mint failed on server");
                                        }
                                    },
                                    onError: () => {
                                        console.warn("⚠️ SSE temporarily disconnected, retrying...");
                                    },
                                });

                                const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash(
                                    "confirmed"
                                );

                                await connection
                                    .confirmTransaction(
                                        {
                                            signature: txid,
                                            blockhash,
                                            lastValidBlockHeight,
                                        },
                                        "confirmed"
                                    )
                                    .catch(console.warn);

                                console.log("✅ NFT minted successfully!");
                                console.log("🎉 Result:");
                                console.log(`Transaction: ${txid}`);
                                console.log(`TX Explorer: https://explorer.solana.com/tx/${txid}?cluster=devnet`);
                            } catch (err) {
                                console.error("❌ Transaction failed:");
                                console.error(err);
                            } finally {
                                clearTimeout(mintTimeoutRef.current);
                                mintTimeoutRef.current = null;
                            }
                        };
                    }

                    if (printerIndicatorRef.current) {
                        printerIndicatorRef.current.style.animation = "none";
                    }
                    if (outputImageRef.current) {
                        outputImageRef.current.setAttribute("src", `data:image/png;base64,${image}`);
                    }
                }

                if (!done) {
                    if (!pollingCancelled) {
                        setTimeout(poll, BASE_DELAY);
                    }
                }
            } catch (err) {
                alert(err);
                console.error("Polling error:", err);
                clearTimeout(timeout);
            }
        }

        poll();
    }

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
                        className="w-full absolute text-green-800 text-xs p-1 transition-all ease-out"
                        style={{
                            bottom: "0",
                            transitionDuration: "2000ms",
                            aspectRatio: "0.62 / 1",
                            fontSize: "8px",
                        }}
                    >
                        <img className="absolute inset-0 w-full h-full" src={cardbackImg} alt="card back" />
                        <div className="relative p-0.5 pb-5 rounded-xl w-full h-full">
                            <div className="relative flex flex-col border-4 rounded-xl w-full outline-4 outline-orange-100 h-full border-green-800 bg-orange-100">
                                <p className="p-1 leading-none">SPECIMEN ANALYSIS LOG // DEPT:006</p>
                                <hr className="border-0 h-0.5 bg-green-800" />
                                <div className="flex w-full items-center">
                                    <div className="h-20 w-8/12 flex flex-col">
                                        <img
                                            src={specimen}
                                            className="ml-auto mr-auto rounded h-full object-cover"
                                            alt="input image"
                                        />
                                    </div>
                                    <div className="border-0 w-0.5 h-full bg-green-800" />
                                    <div className="py-1 w-4/12 flex flex-col gap-1">
                                        <img
                                            src={STONES[stone?.Type]?.thumb}
                                            className=" object-cover"
                                            alt="borfstone"
                                        />
                                        <strong className="mx-1 text-center uppercase py-1 bg-red-800 text-white">
                                            common
                                        </strong>
                                    </div>
                                </div>
                                <hr className="border-0 h-0.5 bg-green-800" />
                                <span className="leading-none px-0.5">[BORFOLOGIST ID # PSM-0000001-25/I]</span>
                                <hr className="border-0 h-0.5 bg-green-800" />
                                <strong className="uppercase leading-none px-0.5">
                                    {`spiral index: issue date: ${new Date().toLocaleDateString()}`}
                                </strong>
                                <span className="uppercase leading-none px-0.5">
                                    {`[23/840K BORF’S][3/164.4K ${stone?.Type}][${biome}: 001]`}
                                </span>
                                <strong className="py-0.5 bg-green-800 text-white uppercase">[borf profile]</strong>
                                <p className="leading-none px-0.5">
                                    <strong className="uppercase">movement class:</strong>
                                    {analyzeResult?.MONSTER_PROFILE?.movement_class}
                                </p>
                                <hr className="border-0 h-0.5 bg-green-800" />
                                <p className="leading-none px-0.5">
                                    <strong className="uppercase">behaviour:</strong>
                                    {analyzeResult?.MONSTER_PROFILE?.behaviour}
                                </p>
                                <hr className="border-0 h-0.5 bg-green-800" />
                                <p className="leading-none px-0.5">
                                    <strong className="uppercase">personality:</strong>
                                    {analyzeResult?.MONSTER_PROFILE?.personality}
                                </p>
                                <hr className="border-0 h-0.5 bg-green-800" />
                                <p className="leading-none px-0.5">
                                    <strong className="uppercase">abilities:</strong>
                                    {analyzeResult?.MONSTER_PROFILE?.abilities}
                                </p>
                                <hr className="border-0 h-0.5 bg-green-800" />
                                <p className="leading-none px-0.5">
                                    <strong className="uppercase">habitat:</strong>
                                    {analyzeResult?.MONSTER_PROFILE?.habitat}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* front card */}
                    <div
                        ref={frontCardRef}
                        className="w-full absolute text-green-800 text-xs p-1 transition-all ease-out"
                        style={{
                            bottom: "-100%",
                            transitionDuration: "2000ms",
                            aspectRatio: "0.62 / 1",
                            fontSize: "8px",
                        }}
                    >
                        <img className="absolute inset-0 w-full h-full" src={cardfrontImg} alt="card front" />
                        <div className="relative p-0.5 pb-5 w-full h-full">
                            <div className="flex flex-col w-full h-full rounded-xl border-4 border-green-800 bg-orange-100">
                                <p className="uppercase text-center">
                                    borflab // <strong>top secret</strong> // specimen
                                </p>
                                <hr className="border-0 h-0.5 bg-green-800" />
                                <div className="flex-grow flex overflow-hidden p-1">
                                    <img
                                        ref={outputImageRef}
                                        className="mr-auto ml-auto h-full object-cover"
                                        alt="output"
                                    />
                                </div>
                                <hr className="border-0 h-0.5 bg-green-800" />
                                <div className="flex justify-between p-0.5">
                                    <div className="flex flex-col justify-between">
                                        <h1 className="leading-tight uppercase font-bold text-lg">
                                            {analyzeResult?.MONSTER_PROFILE?.name}
                                        </h1>
                                        <p className="uppercase leading-none text-sm">
                                            species: <strong>{analyzeResult?.MONSTER_PROFILE?.species}</strong>
                                        </p>
                                    </div>
                                    <div className="border-2 border-green-800">
                                        <h1 className="px-0.5 text-lg font-bold text-center">I</h1>
                                        <hr className="border-0 h-0.5 bg-green-800" />
                                        <span className="px-0.5">chapter</span>
                                    </div>
                                </div>
                                <p className="p-0.5 text-sm uppercase text-gray-100 bg-green-800">
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
            {minting &&
                createPortal(
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
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
