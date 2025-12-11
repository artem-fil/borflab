import { useState, useEffect } from "react";

import api from "../api";

const totalSlots = 9;

export default function Library() {
    const [monsters, setMonsters] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
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
            console.log(Monsters);
            if (Total) {
                setPagination((prev) => ({
                    ...prev,
                    total: Total || 0,
                    pages: Math.ceil((Pages || 0) / totalSlots),
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
            <div className="w-full flex justify-between px-6">
                <div className="flex flex-col">
                    <h2 className="text-white font-bold text-xl">BORFcard Library</h2>
                    <span className="text-xs">
                        Total cards in collection: {String(pagination.total).padStart(3, "0")}
                    </span>
                </div>
                <div className="relative">
                    <button className="h-full bg-red-500">sort</button>
                    <div
                        className={` absolute top-full right-0 flex flex-col items-end text-white bg-black/90 rounded-md uppercase transform transition-all duration-300 origin-top-right z-10 ${
                            monsters ? "scale-y-100 opacity-100" : "scale-y-0 opacity-0"
                        }`}
                        style={{ transformOrigin: "top right" }}
                    >
                        {["biome", "rarity", "created"].map((i) => {
                            return (
                                <div key={i} className="p-2" onClick={() => handleSortChange(i)}>
                                    {i}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
            <div className="w-full h-4 bg-gray-100 border-b-2 border-black shadow-md"></div>
            <div className="w-full flex-grow bg-stone-800 px-6 py-2">
                <div className="grid grid-cols-3 gap-x-4 gap-y-2 w-full h-full">
                    {monsters.map(({ ImageCid, SerialNumber }, i) => (
                        <div key={i} className="flex flex-col gap-1 items-center">
                            <div className="w-full aspect-[3/5] bg-gray-200 rounded-md overflow-hidden">
                                <img
                                    onClick={() => {}}
                                    src={`https://ipfs.io/ipfs/${ImageCid}`}
                                    alt={`specimen ${SerialNumber}`}
                                    className="h-full object-cover"
                                />
                            </div>
                            <span className="text-white uppercase text-xs">specimen 00{i + 1}</span>
                        </div>
                    ))}
                </div>
            </div>
            <div className="w-full h-4 bg-gray-100 shadow-md"></div>
            <button onClick={() => handlePageChange(pagination.page - 1)} disabled={pagination.page <= 1 || loading}>
                ←
            </button>

            <div className="page-info">
                {pagination.page} of {pagination.pages || 1}
            </div>

            <button
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.pages || loading}
            >
                →
            </button>
        </div>
    );
}
