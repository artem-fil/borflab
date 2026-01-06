import { useState, useEffect } from "react";
import Card from "@components/Card";
import Button from "@components/Button";

import api from "../api";

import { RARITIES } from "../config.js";

const totalSlots = 9;

export default function Library() {
    const [openSort, setOpenSort] = useState(false);
    const [monsters, setMonsters] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [loadedImages, setLoadedImages] = useState({});
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
        <div className="flex-grow flex flex-col items-center">
            <div className="w-full flex justify-between px-6 py-2">
                <div className="relative">
                    <Button onClick={() => setOpenSort(!openSort)} label={"sort"} />
                    <div
                        className={` absolute top-full right-0 flex flex-col items-end text-white bg-black/90 rounded-md uppercase transform transition-all duration-300 origin-top-right z-10 ${
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
                <div className="flex flex-col">
                    <h2 className="text-white font-bold text-xl">BORFcard Library</h2>
                    <span className="text-xs">
                        Total cards in collection: {String(pagination.total).padStart(3, "0")}
                    </span>
                </div>
            </div>
            <div className="w-full h-4 bg-gray-100 border-b-2 border-black shadow-md"></div>
            <div className="w-full flex-grow bg-stone-800 px-6 py-2">
                {monsterDialog ? (
                    <div className="flex relative items-center justify-center w-full h-full">
                        <button className="absolute top-0 right-0" onClick={() => setMonsterDialog(null)}>
                            ❌
                        </button>
                        <Card monster={monsterDialog} />
                    </div>
                ) : (
                    <div className="grid grid-cols-3 gap-x-4 gap-y-2 w-full h-full">
                        {monsters.map((monster) => {
                            const isLoaded = loadedImages[monster.SerialNumber];
                            return (
                                <div
                                    key={monster.SerialNumber}
                                    onClick={() => setMonsterDialog(monster)}
                                    className="flex flex-col gap-1 items-center uppercase text-xs"
                                >
                                    <div className="w-full aspect-[3/4] bg-gray-200 rounded-md overflow-hidden relative">
                                        <img
                                            src={`https://serveproxy.com/?url=https://gateway.pinata.cloud/ipfs/${monster.ImageCid}`}
                                            alt={`specimen ${monster.SerialNumber}`}
                                            className={`h-full w-full object-cover transition-opacity duration-500 ${
                                                isLoaded ? "opacity-100" : "opacity-0"
                                            }`}
                                            onLoad={() =>
                                                setLoadedImages((prev) => ({ ...prev, [monster.SerialNumber]: true }))
                                            }
                                        />
                                        {!isLoaded && (
                                            <div className="absolute inset-0 animate-pulse bg-gray-300"></div>
                                        )}
                                    </div>
                                    <span className={`${RARITIES[monster.Rarity]}`}>{monster.Name}</span>
                                    <span className="text-white">{monster.Biome}</span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
            <div className="w-full h-4 bg-gray-100 shadow-md"></div>
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
    );
}
