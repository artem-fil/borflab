import { Link } from "react-router-dom";

import swapomatImg from "@images/swapomat.png";
import cardfrontImg from "@images/card-front.png";
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
    const [mintError, setMintError] = useState(false);
    const [error, setError] = useState(null);
    const mintSSERef = useRef(null);
    const mintTimeoutRef = useRef(null);
    const mintFinishedRef = useRef(false);

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

    return (
        <div className="flex-grow flex flex-col items-center justify-center overflow-hidden p-4">
            <div className="relative max-h-full flex items-center justify-center" style={{ aspectRatio: "1 / 2" }}>
                <img className="max-h-auto object-contain" src={swapomatImg} alt="swapomat" />
                {/* select card dialog */}
                <div
                    className="-translate-x-1/2 absolute cursor-pointer"
                    style={{ width: "55%", top: "17%", left: "50%", aspectRatio: "1 / 1.6" }}
                    onClick={() => setDialog(true)}
                >
                    <div
                        className=" rounded-xl
            pointer-events-none
            absolute inset-0 z-10
            mix-blend-multiply
            backdrop-blur-[0.5px]
            backdrop-saturate-[80%]
            bg-[radial-gradient(circle_at_30%_40%,rgba(120,150,90,0.25),rgba(30,60,40,0.55))]
        "
                    />
                    {monster && (
                        <div
                            className="w-full absolute text-green-800 text-xs p-1 transition-all ease-out"
                            style={{
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
                                            src={`https://serveproxy.com/?url=https://gateway.pinata.cloud/ipfs/${monster.ImageCid}`}
                                            className="mr-auto ml-auto h-full object-cover"
                                            alt="output"
                                        />
                                    </div>
                                    <hr className="border-0 h-0.5 bg-green-800" />
                                    <div className="flex justify-between p-0.5">
                                        <div className="flex flex-col justify-between">
                                            <h1 className="leading-tight uppercase font-bold text-lg">
                                                {monster.Name}
                                            </h1>
                                            <p className="uppercase leading-none text-sm">
                                                species: <strong>{monster.Species}</strong>
                                            </p>
                                        </div>
                                        <div className="border-2 border-green-800">
                                            <h1 className="px-0.5 text-lg font-bold text-center">I</h1>
                                            <hr className="border-0 h-0.5 bg-green-800" />
                                            <span className="px-0.5">chapter</span>
                                        </div>
                                    </div>
                                    <p className="p-0.5 text-sm uppercase text-gray-100 bg-green-800">
                                        biome: <strong className="font-bold text-orange-400">{monster.Biome}</strong>
                                    </p>
                                    <p className="leading-tight px-0.5">
                                        <strong className="uppercase">observation: </strong>
                                        {monster.Lore}
                                    </p>
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
                    className="absolute rounded-full cursor-pointer aspect-square"
                    style={{ width: "4.5%", right: "7.5%", bottom: "25.5%" }}
                ></div>
                {/* init buttton */}
                <div
                    className="-translate-x-1/2 border border-cyan-500 absolute aspect-square cursor-pointer rounded-full"
                    style={{ width: "21%", left: "50%", bottom: "9%" }}
                    onClick={handleMintClick}
                ></div>
                {dialog && (
                    <div className="fixed inset-0 bg-black/80 flex flex-col gap-2 items-center text-white justify-center z-10 p-4">
                        <div className="grid grid-cols-3 gap-x-4 gap-y-2 w-full">
                            {monsters.map((monster, i) => (
                                <div
                                    key={i}
                                    onClick={() => {
                                        setMonster(monster);
                                        setDialog(false);
                                    }}
                                    className="flex flex-col gap-1 items-center uppercase text-xs"
                                >
                                    <div className="w-full aspect-[3/4] bg-gray-200 rounded-md overflow-hidden">
                                        <img
                                            src={`https://serveproxy.com/?url=https://gateway.pinata.cloud/ipfs/${monster.ImageCid}`}
                                            alt={`specimen ${monster.SerialNumber}`}
                                            className="h-full object-cover"
                                        />
                                    </div>
                                    <span className={`${RARITIES[monster.Rarity]}`}>{monster.Name}</span>
                                    <span className="text-white">{monster.Biome}</span>
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-2 py-2 text-lg">
                            <button
                                onClick={() => handlePageChange(pagination.page - 1)}
                                disabled={pagination.page <= 1 || loading}
                            >
                                👈
                            </button>
                            <div>
                                {pagination.page} of {pagination.pages || 1}
                            </div>
                            <button
                                onClick={() => handlePageChange(pagination.page + 1)}
                                disabled={pagination.page >= pagination.pages || loading}
                            >
                                👉
                            </button>
                        </div>
                    </div>
                )}

                {swapping &&
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
                                <span>Swapping...</span>
                            </div>
                        </div>,
                        document.body
                    )}
                {swapping &&
                    createPortal(
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
                            {mintFinishedRef.current ? (
                                <div className="flex flex-col items-center text-white text-lg p-4 rounded-md bg-black/80">
                                    {mintSuccess && (
                                        <div className="flex flex-col items-center">
                                            <span className="text-green-400 font-bold">🥳 Minted successfully!</span>
                                            <Link to={`/library`}>Check library 👉</Link>
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
                                    <span>Swapping...</span>
                                </div>
                            )}
                        </div>,
                        document.body
                    )}
            </div>
        </div>
    );
}
