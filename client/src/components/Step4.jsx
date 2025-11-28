import { Connection, PublicKey } from "@solana/web3.js";

import { useState, useEffect, useRef } from "react";
import posterImg from "../assets/poster.png";
import printerImg from "../assets/printer.png";
import cardbackImg from "../assets/card-back.png";
import cardfrontImg from "../assets/card-front.png";
import api from "../api";
import { useNavigate } from "react-router-dom";
import { useWallets } from "@privy-io/react-auth/solana";

export default function Step4({ specimen, stone, biome, analyzeResult, nextTask }) {
    const { wallets } = useWallets();

    const [done, setDone] = useState(false);
    const [minting, setIsMinting] = useState(false);
    const navigate = useNavigate();
    const frontCardRef = useRef(null);
    const backCardRef = useRef(null);
    const printerIndicatorRef = useRef(null);
    const outputImageRef = useRef(null);

    useEffect(() => {
        if (!nextTask) return;

        pollGenerateProgress(nextTask);
    }, [nextTask]);

    async function pollGenerateProgress(generateTaskId) {
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
                    const { image } = result;
                    setDone(done);
                    clearTimeout(timeout);

                    if (frontCardRef.current) {
                        frontCardRef.current.style.bottom = `0`;
                        frontCardRef.current.addEventListener("click", async () => {
                            if (minting) return;
                            setIsMinting(true);

                            try {
                                console.log("🎮 Starting monster mint...");

                                if (!wallets || wallets.length === 0) {
                                    throw new Error("Connect wallet first");
                                }

                                const solanaWallet = wallets.find((w) => w.chainType === "solana");

                                if (!solanaWallet) {
                                    throw new Error("Solana wallet not found");
                                }

                                const userPublicKey = new PublicKey(solanaWallet.address);

                                const { tx } = await api.prepareMint(generateTaskId, userPublicKey);

                                const signedBase64 = await solanaWallet.signTransaction(tx);

                                const connection = new Connection("https://api.devnet.solana.com", "confirmed");

                                const rawTx = window.Buffer.from(signedBase64, "base64");
                                const txid = await connection.sendRawTransaction(rawTx);
                                const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash(
                                    "confirmed"
                                );

                                const confirmation = await connection.confirmTransaction(
                                    {
                                        signature: txid,
                                        blockhash,
                                        lastValidBlockHeight,
                                    },
                                    "confirmed"
                                );

                                if (confirmation.value.err) {
                                    throw new Error(`Transaction failed: ${confirmation.value.err}`);
                                }

                                console.log("Mint txid:", txid);

                                navigate(`/`);
                            } catch (error) {
                                console.error("❌ Mint failed:", error);
                                throw error;
                            } finally {
                                setIsMinting(false);
                            }
                        });
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
                        setTimeout(poll, 1500);
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
                                <p className="p-1 leading-none">BORFLAB: SPECIMEN ANALYSIS LOG // DEPT:006</p>
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
                                        <img src={stone?.image} className=" object-cover" alt="borfstone" />
                                        <strong className="mx-1 text-center uppercase py-1 bg-red-800 text-white">
                                            common
                                        </strong>
                                    </div>
                                </div>
                                <hr className="border-0 h-0.5 bg-green-800" />
                                <span className="leading-none px-0.5">[BORFOLOGIST ID # PSM-0000001-25/I]</span>
                                <hr className="border-0 h-0.5 bg-green-800" />
                                <strong className="uppercase leading-none px-0.5">
                                    spiral index: issue date: 19.10.2025
                                </strong>
                                <span className="uppercase leading-none px-0.5">
                                    {`[23/840K BORF’S][3/164.4K ${stone?.name}][${biome}: 001]`}
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
        </div>
    );
}
