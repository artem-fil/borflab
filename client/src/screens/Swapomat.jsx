import { Link, useParams } from "react-router-dom";

import cardfrontImg from "@images/card-front.png";
import swapomatImg from "@images/swapomat.png";
import watermarkImg from "@images/watermark.png";
import { useWallets } from "@privy-io/react-auth/solana";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import api from "../api";
import { BIOMES, RARITIES, STONES } from "../config.js";

const totalSlots = 9;

export default function Swapomat() {
    const { wallets } = useWallets();
    const { monsterId } = useParams();

    const [monsters, setMonsters] = useState([]);
    const [swapPool, setSwapPool] = useState([]);
    const [monster, setMonster] = useState(null);
    const [gainedMonster, setGainedMonster] = useState(null);
    const [slotMonster, setSlotMonster] = useState(null);
    const [status, setStatus] = useState("idle");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [dialog, setDialog] = useState(false);
    const [activeWallet, setActiveWallet] = useState(null);

    const [pagination, setPagination] = useState({
        page: 1,
        limit: totalSlots,
        sort: "created",
        order: "desc",
        total: 0,
        pages: 0,
    });

    const mintSSERef = useRef(null);
    const mintTimeoutRef = useRef(null);
    const slotIntervalRef = useRef(null);
    const slotIdxRef = useRef(0);

    useEffect(() => {
        if (!wallets?.length) return;
        const stored = localStorage.getItem("primaryWallet");
        setActiveWallet(wallets.find((w) => w.address === stored) || wallets[0]);
    }, [wallets]);

    useEffect(() => {
        fetchData();
    }, [pagination.page, pagination.limit, pagination.sort, pagination.order]);

    async function fetchData() {
        try {
            setLoading(true);
            const { Monsters, SwapPool, Total, Pages } = await api.getSwapomat({
                page: pagination.page,
                limit: pagination.limit,
                sort: pagination.sort,
                order: pagination.order,
            });
            setMonsters(Monsters);
            setSwapPool(SwapPool);
            if (Total) setPagination((p) => ({ ...p, total: Total, pages: Pages }));
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    // ─── Если в URL есть monsterId — подставить образец
    useEffect(() => {
        if (!monsterId || !monsters.length) return;
        const found = monsters.find((m) => m.MintAddress === monsterId);
        if (found) {
            setMonster(found);
            setSlotMonster(found);
            return;
        }
        (async () => {
            try {
                setLoading(true);
                const { Monster } = await api.getMonster(monsterId);
                setMonster(Monster);
                setSlotMonster(Monster);
            } catch (err) {
                console.error("Failed to fetch monster from URL:", err);
            } finally {
                setLoading(false);
            }
        })();
    }, [monsterId, monsters]);

    // ─── Синхронизировать slotMonster с выбранным образцом в idle
    useEffect(() => {
        if (status === "idle") setSlotMonster(monster);
    }, [monster, status]);

    // ─── Анимация слота
    function startSlotSpin() {
        if (!swapPool.length) return;
        slotIdxRef.current = 0;

        const tick = (delay) => {
            slotIntervalRef.current = setInterval(() => {
                slotIdxRef.current = (slotIdxRef.current + 1) % swapPool.length;
                setSlotMonster(swapPool[slotIdxRef.current]);
            }, delay);
        };

        tick(100);
    }

    function slowDownSlot(finalMonster) {
        clearInterval(slotIntervalRef.current);
        // Замедляем: 40 → 80 → 160 → 320 → стоп
        const steps = [180, 300, 540, 800];
        let i = 0;
        const step = () => {
            if (i >= steps.length) {
                setSlotMonster(finalMonster);
                return;
            }
            // показать случайную карту из пула на каждом шаге
            setSlotMonster(swapPool[Math.floor(Math.random() * swapPool.length)]);
            slotIntervalRef.current = setTimeout(() => {
                i++;
                step();
            }, steps[i]);
        };
        step();
    }

    // ─── Клик по кнопке
    async function handleMintClick() {
        if (!monster || status === "swapping") return;

        setStatus("swapping");
        setGainedMonster(null);
        startSlotSpin();

        const solanaWallet = activeWallet;

        mintTimeoutRef.current = setTimeout(() => {
            mintSSERef.current?.close();
            cleanupMint();
            setStatus("error");
        }, 60000);

        mintSSERef.current = api.subscribeSSE(solanaWallet.address, {
            onEvent: async (event, data) => {
                if (event === "confirmed") {
                    const { Monster } = await api.getMonster(data);
                    setGainedMonster(Monster);
                    slowDownSlot(Monster); // замедлить и остановиться на результате
                    cleanupMint();
                    // status → 'success' ставим после того как слот остановится
                    setTimeout(() => setStatus("success"), 1100);
                }
                if (event === "failed") {
                    cleanupMint();
                    setStatus("error");
                }
            },
            onError: () => console.warn("SSE temporarily disconnected, retrying…"),
        });

        try {
            await api.swapMonster({
                userPubKey: solanaWallet.address,
                monsterPubKey: monster.MintAddress,
            });
        } catch (err) {
            console.error("Transaction failed:", err);
            cleanupMint();
            setStatus("error");
        }
    }

    function cleanupMint() {
        clearTimeout(mintTimeoutRef.current);
        clearInterval(slotIntervalRef.current);
        mintSSERef.current?.close();
        mintSSERef.current = null;
        mintTimeoutRef.current = null;
    }

    function handleDismiss() {
        setStatus("idle");
        setGainedMonster(null);
        setMonster(null);
        setSlotMonster(null);
    }

    const handlePageChange = (newPage) => setPagination((p) => ({ ...p, page: newPage }));

    if (!activeWallet) return <span>Loading wallets…</span>;

    const isSpinning = status === "swapping";
    const isFinished = status === "success" || status === "error";
    const canSubmit = monster !== null && !isSpinning;
    const displayCard = slotMonster;
    const { bg, text, border, icon } = BIOMES[displayCard?.Biome] || {};

    return (
        <div
            className={`flex-grow flex flex-col items-center justify-center overflow-hidden p-4 ${isSpinning ? "shake-machine" : ""}`}
        >
            <style>{`
                @keyframes industrial-shake {
                    0%   { transform: translate(0,0) rotate(0); }
                    25%  { transform: translate(1.5px,-1.5px) rotate(0.15deg); }
                    50%  { transform: translate(-1.5px,1.5px) rotate(-0.15deg); }
                    75%  { transform: translate(1.5px,1.5px) rotate(0.05deg); }
                    100% { transform: translate(0,0) rotate(0); }
                }
                .shake-machine { animation: industrial-shake 0.1s infinite linear; }

                @keyframes slide-in-left {
                    from { transform: translateX(-110%); opacity: 0.5; }
                    to   { transform: translateX(0);     opacity: 1; }
                }
                .slot-card-enter { animation: slide-in-left 0.06s ease-out; }
            `}</style>

            <div className="relative max-h-full flex items-center justify-center" style={{ aspectRatio: "1 / 2" }}>
                <img className="max-h-auto object-contain" src={swapomatImg} alt="swapomat" />

                {/* ─── Слот с карточкой */}
                <div
                    className="-translate-x-1/2 left-1/2 absolute overflow-hidden cursor-pointer"
                    style={{ width: "66%", top: "17%", aspectRatio: "0.62 / 1" }}
                    onClick={() => !isSpinning && !isFinished && setDialog(true)}
                >
                    {displayCard && (
                        <div
                            key={displayCard.MintAddress}
                            className={`slot-card-enter mx-auto relative text-[8px] box-border ${text} p-1`}
                            style={{ aspectRatio: "0.62 / 1", width: "85%" }}
                        >
                            <div className="rounded-xl pointer-events-none absolute inset-0 z-20 mix-blend-multiply backdrop-blur-[0.5px] backdrop-saturate-[80%] bg-[radial-gradient(circle_at_30%_40%,rgba(120,150,90,0.25),rgba(30,60,40,0.55))]" />
                            <img className="absolute inset-0 w-full h-full" src={cardfrontImg} alt="card front" />
                            <div className="relative p-0.5 pb-5 w-full h-full">
                                <div
                                    className="absolute rounded-xl mx-0.5 mb-5 mt-0.5 bg-paper inset-0 z-10"
                                    style={{ backgroundSize: "cover", mixBlendMode: "multiply", opacity: 1 }}
                                />
                                <div
                                    className={`relative flex flex-col w-full h-full rounded-xl border-4 ring-orange-50 ring-1 ${border} bg-orange-50`}
                                >
                                    <div className="p-0.5 uppercase">
                                        <p className="leading-tight">borflab exo-bio division</p>
                                    </div>
                                    <hr className={`border-0 h-0.5 ${bg}`} />
                                    <div className="relative flex-grow flex p-0.5">
                                        <img
                                            src={displayCard.ThumbUrl}
                                            className="max-h-full max-w-full w-auto h-auto object-contain mr-auto ml-auto z-10"
                                            alt="output"
                                        />
                                        <img
                                            src={watermarkImg}
                                            className="absolute right-0 w-2/3 top-0"
                                            alt="watermark"
                                        />
                                    </div>
                                    <hr className={`border-0 h-0.5 ${bg}`} />
                                    <div className="flex items-center">
                                        <div className="flex flex-col gap-2 p-1 grow text-xs">
                                            <p className="flex gap-2 items-baseline">
                                                ID:
                                                <span
                                                    className={`leading-none grow border-b ${border} uppercase font-special text-black`}
                                                >
                                                    {displayCard.Name}
                                                </span>
                                            </p>
                                        </div>
                                        <hr className={`w-0.5 h-10 ${bg}`} />
                                        <div className="p-1 w-10 h-10">
                                            <img
                                                src={STONES[displayCard.Stone]?.image}
                                                className="w-full"
                                                alt="borfstone"
                                            />
                                        </div>
                                    </div>
                                    <div
                                        className={`rounded-b-md flex text-xs items-center gap-2 p-0.5 uppercase text-orange-50 ${bg}`}
                                    >
                                        <img src={icon} className="w-8 opacity-50" alt="" />
                                        <span>
                                            biome:{" "}
                                            <strong className="font-bold text-accent">{displayCard.Biome}</strong>
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {!displayCard && (
                        <div className="absolute inset-0 flex items-center justify-center text-[10px] uppercase opacity-40 tracking-widest">
                            insert specimen
                        </div>
                    )}
                </div>

                {/* Индикатор состояния */}
                <div
                    className={`absolute rounded-full aspect-square ${
                        isSpinning ? "bg-red-500 animate-pulse" : canSubmit ? "bg-green-500" : "bg-gray-400"
                    }`}
                    style={{ width: "4.5%", right: "7.3%", bottom: "23.3%" }}
                />

                {/* Кнопка запуска */}
                <button
                    disabled={!canSubmit}
                    className={`border -translate-x-1/2 absolute aspect-square rounded-full transition-transform active:scale-95
                        ${canSubmit ? "cursor-pointer" : "cursor-not-allowed opacity-40"}
                        ${isSpinning ? "pointer-events-none" : ""}
                    `}
                    style={{
                        width: "21%",
                        left: "50%",
                        bottom: "9%",
                        boxShadow: isSpinning ? "0 0 15px rgba(255,0,0,0.5)" : "none",
                    }}
                    onClick={handleMintClick}
                />

                {/* ─── Диалог выбора образца */}
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
                                        <img src={m.ThumbUrl} alt={m.Name} className="h-full object-cover" />
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

                {/* ─── Оверлей результата (только success/error, не во время спина) */}
                {isFinished &&
                    createPortal(
                        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
                            <div className="flex flex-col items-center text-white p-6 rounded-xl bg-black/90 border-2 border-green-800 shadow-2xl">
                                {status === "success" && gainedMonster ? (
                                    <>
                                        {/* карточка результата — идентичная разметка, без дублирования логики отображения */}
                                        <div
                                            className="w-48 relative text-green-800 text-xs p-1"
                                            style={{ aspectRatio: "0.62 / 1", fontSize: "8px" }}
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
                                                    <div className="flex-grow flex overflow-hidden p-1">
                                                        <img
                                                            src={gainedMonster.ThumbUrl}
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
                                                                species: <strong>{gainedMonster.Species}</strong>
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
                                                        <strong className="text-orange-400">
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
                                        <span className="text-green-400 font-bold uppercase tracking-widest text-center mt-4">
                                            Minting Complete
                                        </span>
                                        <Link
                                            to="/library"
                                            className="bg-green-700 px-4 py-2 rounded text-sm hover:bg-green-600 transition-colors mt-2"
                                        >
                                            Open Library
                                        </Link>
                                    </>
                                ) : (
                                    <>
                                        <span className="text-2xl">❌</span>
                                        <span className="text-red-400 font-bold uppercase">System Failure</span>
                                        <button onClick={handleDismiss} className="text-xs underline mt-2">
                                            Dismiss
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>,
                        document.body
                    )}
            </div>
        </div>
    );
}
