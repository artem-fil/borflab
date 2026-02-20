import { Link } from "react-router-dom";

import swapomatImg from "@images/swapomat.png";
import cardfrontImg from "@images/card-front.png";
import Card from "@components/Card";
import api from "../api";
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { RARITIES } from "../config.js";
import { useWallets } from "@privy-io/react-auth/solana";

const totalSlots = 9;

export default function Swapomat() {
    const { wallets } = useWallets();
    const [dialog, setDialog] = useState(false);
    const [monsters, setMonsters] = useState([]);
    const [monster, setMonster] = useState(null);
    const [loading, setLoading] = useState(false);
    const [swapping, setSwapping] = useState(false);
    const [mintSuccess, setMintSuccess] = useState(false);
    const [activeWallet, setActiveWallet] = useState(null);
    const [gainedMonster, setGainedMonster] = useState(null);
    const [mintError, setMintError] = useState(false);
    const [error, setError] = useState(null);
    const mintSSERef = useRef(null);
    const mintTimeoutRef = useRef(null);
    const mintFinishedRef = useRef(false);
    const [fakeIndex, setFakeIndex] = useState(0);

    const [pagination, setPagination] = useState({
        page: 1,
        limit: totalSlots,
        sort: "created",
        order: "desc",
        total: 0,
        pages: 0,
    });

    useEffect(() => {
        if (!wallets || wallets.length === 0) return;

        const storedWallet = localStorage.getItem("primaryWallet");
        const wallet = wallets.find((w) => w.address === storedWallet) || wallets[0];

        setActiveWallet(wallet);
    }, [wallets]);

    useEffect(() => {
        fetchMonsters();
    }, [pagination.page, pagination.limit, pagination.sort, pagination.order]);

    useEffect(() => {
        let interval;
        if (swapping && !mintFinishedRef.current) {
            interval = setInterval(() => {
                setFakeIndex(Math.floor(Math.random() * monsters.length));
            }, 50);
        }
        return () => clearInterval(interval);
    }, [swapping, monsters.length]);

    async function fetchMonsters() {
        try {
            setLoading(true);
            const { Monsters, Total, Pages } = await api.getMonsters({
                page: pagination.page,
                limit: pagination.limit,
                sort: pagination.sort,
                order: pagination.order,
            });

            setMonsters(Monsters);
            if (Total) {
                setPagination((prev) => ({
                    ...prev,
                    total: Total || 0,
                    pages: Pages,
                }));
            }
        } catch (err) {
            setError(err.message);
            console.error("cannot load monsters:", err);
        } finally {
            setLoading(false);
        }
    }

    async function handleMintClick() {
        if (swapping) return;

        if (monster == null) {
            alert("select card");
        }

        try {
            setSwapping(true);
            const storedWallet = localStorage.getItem("primaryWallet");
            const solanaWallet = wallets.find((w) => w.address === storedWallet) || wallets[0];

            mintTimeoutRef.current = setTimeout(() => {
                console.warn("⏰ Mint SSE timeout");
                mintSSERef.current?.close();
                mintSSERef.current = null;
            }, 60000);

            mintSSERef.current = api.subscribeSSE(solanaWallet.address, {
                onEvent: async (event, data) => {
                    if (event === "confirmed") {
                        const { Monster } = await api.getMonster(data);
                        setGainedMonster(Monster);
                        setMintSuccess(true);
                        cleanupMint();
                    }

                    if (event === "failed") {
                        setMintError(true);
                        cleanupMint();
                        console.error("❌ Mint failed", data);
                    }
                },

                onError: () => {
                    console.warn("⚠️ SSE temporarily disconnected, retrying...");
                },
            });

            const { Signature } = await api.swapMonster({
                userPubKey: solanaWallet.address,
                monsterPubKey: monster.MintAddress,
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

    const handlePageChange = (newPage) => {
        setPagination((prev) => ({ ...prev, page: newPage }));
    };

    if (!activeWallet) {
        return <span>Loading wallets…</span>;
    }
    const isSpinning = swapping && !mintFinishedRef.current;
    const displayMonster = isSpinning ? monsters[fakeIndex] : monster;

    return (
        <div
            className={`flex-grow flex flex-col items-center justify-center overflow-hidden p-4 ${
                isSpinning ? "shake-machine" : ""
            }`}
        >
            <style>{`
                @keyframes industrial-shake {
                    0% { transform: translate(0,0) rotate(0); }
                    25% { transform: translate(1.5px, -1.5px) rotate(0.15deg); }
                    50% { transform: translate(-1.5px, 1.5px) rotate(-0.15deg); }
                    75% { transform: translate(1.5px, 1.5px) rotate(0.05deg); }
                    100% { transform: translate(0,0) rotate(0); }
                }
                .shake-machine {
                    animation: industrial-shake 0.1s infinite linear;
                }
                .spinning-card {
                    filter: brightness(1.3) contrast(1.1) blur(0.3px);
                }
                @keyframes data-flow {
                    0% { opacity: 0.4; }
                    50% { opacity: 1; }
                    100% { opacity: 0.4; }
                }
                .data-crunching {
                    animation: data-flow 0.2s infinite;
                }
            `}</style>

            <div className="relative max-h-full flex items-center justify-center" style={{ aspectRatio: "1 / 2" }}>
                <img className="max-h-auto object-contain" src={swapomatImg} alt="swapomat" />

                <div
                    className="-translate-x-1/2 absolute cursor-pointer"
                    style={{ width: "55%", top: "17%", left: "50%", aspectRatio: "1 / 1.6" }}
                    onClick={() => !isSpinning && setDialog(true)}
                >
                    <div className="rounded-xl pointer-events-none absolute inset-0 z-10 mix-blend-multiply backdrop-blur-[0.5px] backdrop-saturate-[80%] bg-[radial-gradient(circle_at_30%_40%,rgba(120,150,90,0.25),rgba(30,60,40,0.55))]" />

                    {displayMonster && (
                        <div
                            className={`w-full absolute text-green-800 text-xs p-1 transition-all ease-out ${
                                isSpinning ? "spinning-card" : ""
                            }`}
                            style={{
                                aspectRatio: "0.62 / 1",
                                fontSize: "8px",
                            }}
                        >
                            <img className="absolute inset-0 w-full h-full" src={cardfrontImg} alt="card front" />
                            <div className="relative p-0.5 pb-5 w-full h-full">
                                <div className="flex flex-col w-full h-full rounded-xl border-4 border-green-800 bg-orange-100">
                                    <p className="uppercase text-center">
                                        borflab // <strong>{isSpinning ? "analyzing..." : "top secret"}</strong> //
                                        specimen
                                    </p>
                                    <hr className="border-0 h-0.5 bg-green-800" />

                                    <div className="flex-grow flex overflow-hidden p-1 relative">
                                        <img
                                            src={`https://serveproxy.com/?url=https://gateway.pinata.cloud/ipfs/${displayMonster.ImageCid}`}
                                            className="mr-auto ml-auto h-full object-cover"
                                            alt="output"
                                        />
                                        {isSpinning && (
                                            <div className="absolute inset-0 bg-gradient-to-t from-green-500/20 to-transparent pointer-events-none" />
                                        )}
                                    </div>

                                    <hr className="border-0 h-0.5 bg-green-800" />

                                    {isSpinning ? (
                                        <div className="flex-grow flex items-center justify-center bg-green-900 text-orange-400 p-2 text-center">
                                            <span className="data-crunching font-bold text-[10px] uppercase">
                                                Recalibrating DNA...
                                                <br />
                                                Sequence {Math.floor(Math.random() * 9999)}
                                            </span>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex justify-between p-0.5">
                                                <div className="flex flex-col justify-between">
                                                    <h1 className="leading-tight uppercase font-bold text-lg">
                                                        {displayMonster.Name}
                                                    </h1>
                                                    <p className="uppercase leading-none text-sm">
                                                        species: <strong>{displayMonster.Species}</strong>
                                                    </p>
                                                </div>
                                                <div className="border-2 border-green-800">
                                                    <h1 className="px-0.5 text-lg font-bold text-center">I</h1>
                                                    <hr className="border-0 h-0.5 bg-green-800" />
                                                    <span className="px-0.5">chapter</span>
                                                </div>
                                            </div>
                                            <p className="p-0.5 text-sm uppercase text-gray-100 bg-green-800">
                                                biome:{" "}
                                                <strong className="font-bold text-orange-400">
                                                    {displayMonster.Biome}
                                                </strong>
                                            </p>
                                            <p className="leading-tight px-0.5">
                                                <strong className="uppercase">observation: </strong>
                                                {displayMonster.Lore}
                                            </p>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* tray */}
                <div
                    className="-translate-x-1/2 absolute cursor-pointer"
                    style={{ width: "72%", height: "3%", left: "50%", bottom: "25%" }}
                ></div>

                {/* tray indicator */}
                <div
                    className={`absolute rounded-full cursor-pointer aspect-square ${
                        isSpinning ? "bg-red-500 animate-pulse" : "bg-green-500"
                    }`}
                    style={{ width: "4.5%", right: "7.3%", bottom: "23.3%" }}
                ></div>

                {/* init button */}
                <div
                    className={`-translate-x-1/2 absolute aspect-square cursor-pointer rounded-full transition-transform active:scale-95 ${
                        isSpinning ? "pointer-events-none opacity-50" : ""
                    }`}
                    style={{
                        width: "21%",
                        left: "50%",
                        bottom: "9%",
                        border: "2px solid rgba(0,255,255,0.3)",
                        boxShadow: isSpinning ? "0 0 15px rgba(255,0,0,0.5)" : "none",
                    }}
                    onClick={handleMintClick}
                ></div>

                {dialog && (
                    <div className="fixed inset-0 bg-black/80 flex flex-col gap-2 items-center text-white justify-center z-50 p-4">
                        <div className="grid grid-cols-3 gap-x-4 gap-y-2 w-full max-w-md">
                            {monsters.map((m, i) => (
                                <div
                                    key={i}
                                    onClick={() => {
                                        setMonster(m);
                                        setDialog(false);
                                    }}
                                    className="flex flex-col gap-1 items-center uppercase text-[10px] cursor-pointer hover:scale-105 transition-transform"
                                >
                                    <div className="w-full aspect-[3/4] bg-gray-200 rounded-md overflow-hidden border-2 border-transparent hover:border-green-400">
                                        <img
                                            src={`https://serveproxy.com/?url=https://gateway.pinata.cloud/ipfs/${m.ImageCid}`}
                                            alt={m.Name}
                                            className="h-full object-cover"
                                        />
                                    </div>
                                    <span className={`${RARITIES[m.Rarity]} text-center`}>{m.Name}</span>
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-4 py-4 text-2xl">
                            <button
                                onClick={() => handlePageChange(pagination.page - 1)}
                                disabled={pagination.page <= 1}
                            >
                                👈
                            </button>
                            <span className="text-base flex items-center">
                                {pagination.page} / {pagination.pages}
                            </span>
                            <button
                                onClick={() => handlePageChange(pagination.page + 1)}
                                disabled={pagination.page >= pagination.pages}
                            >
                                👉
                            </button>
                        </div>
                        <button className="mt-4 text-gray-400 underline" onClick={() => setDialog(false)}>
                            Close
                        </button>
                    </div>
                )}

                {swapping &&
                    createPortal(
                        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 pointer-events-none">
                            <div className="flex flex-col items-center text-white p-6 rounded-xl bg-black/90 border-2 border-green-800 shadow-2xl pointer-events-auto">
                                {mintFinishedRef.current ? (
                                    <div className="flex flex-col items-center gap-4">
                                        {mintSuccess ? (
                                            <>
                                                <div
                                                    className={`w-full absolute text-green-800 text-xs p-1 transition-all ease-out`}
                                                    style={{
                                                        aspectRatio: "0.62 / 1",
                                                        fontSize: "8px",
                                                    }}
                                                >
                                                    <img
                                                        className="absolute inset-0 w-full h-full"
                                                        src={cardfrontImg}
                                                        alt="card front"
                                                    />
                                                    <div className="relative p-0.5 pb-5 w-full h-full">
                                                        <div className="flex flex-col w-full h-full rounded-xl border-4 border-green-800 bg-orange-100">
                                                            <p className="uppercase text-center">
                                                                borflab // top secret // specimen
                                                            </p>
                                                            <hr className="border-0 h-0.5 bg-green-800" />

                                                            <div className="flex-grow flex overflow-hidden p-1 relative">
                                                                <img
                                                                    src={`https://serveproxy.com/?url=https://gateway.pinata.cloud/ipfs/${gainedMonster.ImageCid}`}
                                                                    className="mr-auto ml-auto h-full object-cover"
                                                                    alt="output"
                                                                />
                                                            </div>

                                                            <hr className="border-0 h-0.5 bg-green-800" />
                                                            <div className="flex justify-between p-0.5">
                                                                <div className="flex flex-col justify-between">
                                                                    <h1 className="leading-tight uppercase font-bold text-lg">
                                                                        {gainedMonster.Name}
                                                                    </h1>
                                                                    <p className="uppercase leading-none text-sm">
                                                                        species:{" "}
                                                                        <strong>{gainedMonster.Species}</strong>
                                                                    </p>
                                                                </div>
                                                                <div className="border-2 border-green-800">
                                                                    <h1 className="px-0.5 text-lg font-bold text-center">
                                                                        I
                                                                    </h1>
                                                                    <hr className="border-0 h-0.5 bg-green-800" />
                                                                    <span className="px-0.5">chapter</span>
                                                                </div>
                                                            </div>
                                                            <p className="p-0.5 text-sm uppercase text-gray-100 bg-green-800">
                                                                biome:{" "}
                                                                <strong className="font-bold text-orange-400">
                                                                    {gainedMonster.Biome}
                                                                </strong>
                                                            </p>
                                                            <p className="leading-tight px-0.5">
                                                                <strong className="uppercase">observation: </strong>
                                                                {gainedMonster.Lore}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                                <span className="text-green-400 font-bold uppercase tracking-widest text-center">
                                                    Minting Complete
                                                </span>
                                                <Link
                                                    to="/library"
                                                    className="bg-green-700 px-4 py-2 rounded text-sm hover:bg-green-600 transition-colors"
                                                >
                                                    Open Library
                                                </Link>
                                            </>
                                        ) : (
                                            <>
                                                <span className="text-2xl">❌</span>
                                                <span className="text-red-400 font-bold uppercase">System Failure</span>
                                                <button
                                                    onClick={() => setSwapping(false)}
                                                    className="text-xs underline mt-2"
                                                >
                                                    Dismiss
                                                </button>
                                            </>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center gap-4">
                                        <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                                        <span className="uppercase tracking-[0.2em] text-orange-500 animate-pulse">
                                            Processing...
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>,
                        document.body
                    )}
            </div>
        </div>
    );
}
