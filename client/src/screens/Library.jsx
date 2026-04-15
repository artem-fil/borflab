import Button from "@components/Button";
import Card from "@components/Card";
import borderBottomImg from "@images/border-bottom.png";
import borderTopImg from "@images/border-top.png";
import buttonChevronActiveImg from "@images/button-chevron-active.png";
import buttonChevronDisabledImg from "@images/button-chevron-disabled.png";
import slotImg from "@images/slot.png";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import api from "../api";

import { BIOMES } from "../config.js";

const totalSlots = 9;

export default function Library() {
    const navigate = useNavigate();
    const [openSort, setOpenSort] = useState(false);
    const [monsters, setMonsters] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [monsterDialog, setMonsterDialog] = useState(false);

    const [pagination, setPagination] = useState({
        page: 1,
        limit: totalSlots,
        sort: "created",
        order: "desc",
        total: 0,
        pages: 0,
    });

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

    const handlePageChange = (newPage) => {
        setPagination((prev) => ({ ...prev, page: newPage }));
    };

    const handleSortChange = (newSort) => {
        if (newSort === pagination.sort) {
            setPagination((prev) => ({
                ...prev,
                page: 1,
                order: prev.order === "desc" ? "asc" : "desc",
            }));
        } else {
            setPagination((prev) => ({
                ...prev,
                page: 1,
                sort: newSort,
                order: "desc",
            }));
        }
    };

    return (
        <div className="flex-grow flex flex-col items-center min-h-0 overflow-hidden">
            {/* top bar */}
            <div className="w-full flex justify-between px-4 py-4">
                <div className="flex flex-col">
                    <h2 className="text-white font-bold text-xl">BORFcard Library</h2>
                    <span className="text-xs">
                        Total cards in collection: {String(pagination.total).padStart(3, "0")}
                    </span>
                </div>
                <div className="relative">
                    <Button
                        onClick={monsterDialog ? () => setMonsterDialog(null) : () => setOpenSort(!openSort)}
                        label={monsterDialog ? "close" : "sort"}
                    />
                    <div
                        className={` absolute top-full right-0 flex flex-col items-end text-white bg-black/90 rounded-md uppercase transform transition-all duration-300 origin-top-right z-20 ${
                            openSort ? "scale-y-100 opacity-100" : "scale-y-0 opacity-0"
                        }`}
                        style={{ transformOrigin: "top right" }}
                    >
                        {["name", "biome", "rarity", "created"].map((field) => {
                            return (
                                <div
                                    key={field}
                                    className="p-2"
                                    onClick={() => {
                                        setOpenSort(!openSort);
                                        handleSortChange(field);
                                    }}
                                >
                                    {field}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
            <div className="w-full h-4 border-b-2 border-black shadow-md">
                <img src={borderTopImg} className={`h-full w-full object-cover`} />
            </div>
            {/* cards */}
            <div
                style={{
                    backgroundBlendMode: "multiply",
                    backgroundColor: "rgba(0,0,0,0.3)",
                }}
                className={`w-full flex-grow bg-metal bg-cover bg-center bg-no-repeat px-4 py-4 min-h-0 ${
                    monsterDialog ? "overflow-hidden" : "overflow-y-auto"
                }`}
            >
                {monsterDialog ? (
                    <div className="flex items-center justify-center w-full h-full">
                        <Card monster={monsterDialog} className="max-h-full max-w-full w-auto h-auto" />
                    </div>
                ) : (
                    <div className="grid grid-cols-3 gap-x-3 gap-y-2 w-full h-full">
                        {monsters.map((monster) => {
                            const { bg, accent } = BIOMES[monster.Biome];

                            return (
                                <div
                                    key={monster.SerialNumber}
                                    onClick={() => setMonsterDialog(monster)}
                                    className="flex flex-col gap-1 items-center uppercase text-xs"
                                >
                                    <div
                                        className={`relative w-full inset-0`}
                                        style={{
                                            aspectRatio: "1 / 1.25",
                                        }}
                                    >
                                        <img
                                            className="absolute inset-0 w-full h-full"
                                            src={slotImg}
                                            alt="card front"
                                        />
                                        <img
                                            src={`https://serveproxy.com/?url=https://gateway.pinata.cloud/ipfs/${monster.ImageCid}`}
                                            className="absolute top-1/2 w-full -translate-y-1/2 left-0 object-cover z-10"
                                            alt="output"
                                        />
                                    </div>
                                    <div className="rounded text-center font-bold text-[10px] border w-full bg-gray-200 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]">
                                        {monster.Name}
                                    </div>
                                    <div
                                        className={`${accent} w-full h-2 rounded-sm shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]`}
                                    ></div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
            <div className="w-full h-4 border-b-2 border-black shadow-md">
                <img src={borderBottomImg} className={`h-full w-full object-cover`} />
            </div>
            {/* pagination */}

            {monsterDialog ? (
                <div className="w-full px-4 flex gap-2 items-center justify-center py-4 text-lg">
                    <Button onClick={() => navigate(`/swapomat/${monsterDialog.MintAddress}`)} label={"swap"} />
                    <Button disabled label={"play"} />
                </div>
            ) : (
                <div className="w-full px-4 flex gap-2 items-center justify-between py-4 text-lg">
                    <button
                        onClick={() => handlePageChange(pagination.page - 1)}
                        disabled={pagination.page <= 1 || loading}
                        className="w-6 h-6 p-0 bg-transparent border-none "
                    >
                        <img
                            src={pagination.page <= 1 || loading ? buttonChevronDisabledImg : buttonChevronActiveImg}
                            alt="Previous"
                            className="w-full h-full object-contain transform"
                        />
                    </button>

                    <div className="text-white flex gap-0.5 items-center">
                        {String(pagination.page)
                            .padStart(2, "0")
                            .split("")
                            .map((digit, index) => (
                                <div
                                    key={index}
                                    className="font-bold bg-gradient-to-b from-stone-900 via-stone-400 via-50% to-stone-900 px-2 py-3 rounded-lg text-2xl"
                                >
                                    {digit}
                                </div>
                            ))}
                        <div className="flex flex-col ml-2">
                            <strong className="text-sm leading-tight font-bold uppercase">BORFOLIGICAL</strong>
                            <span className="text-xs">specimen tray no. </span>
                        </div>
                    </div>

                    <button
                        onClick={() => handlePageChange(pagination.page + 1)}
                        disabled={pagination.page >= pagination.pages || loading}
                        className="w-6 h-6 p-0 bg-transparent border-none"
                    >
                        <img
                            src={
                                pagination.page >= pagination.pages || loading
                                    ? buttonChevronDisabledImg
                                    : buttonChevronActiveImg
                            }
                            alt="Next"
                            className="w-full h-full object-contain -scale-x-100"
                        />
                    </button>
                </div>
            )}
        </div>
    );
}
