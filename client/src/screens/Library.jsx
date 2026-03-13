import Button from "@components/Button";
import Card from "@components/Card";
import borderBottomImg from "@images/border-bottom.png";
import borderTopImg from "@images/border-top.png";
import buttonActiveImg from "@images/button-active.png";
import buttonDisabledImg from "@images/button-disabled.png";
import cardfrontImg from "@images/card-front.png";
import { useEffect, useState } from "react";

import api from "../api";

import { BIOMES } from "../config.js";

const totalSlots = 9;

export default function Library() {
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
        <div className="flex-grow flex flex-col items-center">
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
            </div>
            <div className="w-full h-4 border-b-2 border-black shadow-md">
                <img src={borderTopImg} className={`h-full w-full object-cover`} />
            </div>
            <div
                style={{
                    backgroundBlendMode: "multiply",
                    backgroundColor: "rgba(0,0,0,0.3)",
                }}
                className="w-full flex-grow bg-metal bg-cover  bg-center  bg-no-repeat px-4 py-4"
            >
                {monsterDialog ? (
                    <div className="flex items-center justify-center w-full h-full">
                        <Card monster={monsterDialog} />
                    </div>
                ) : (
                    <div className="grid grid-cols-3 gap-x-3 gap-y-2 w-full h-full">
                        {monsters.map((monster) => {
                            const { border, bg, text } = BIOMES[monster.Biome];
                            return (
                                <div
                                    key={monster.SerialNumber}
                                    onClick={() => setMonsterDialog(monster)}
                                    className="flex flex-col gap-1 items-center uppercase text-xs"
                                >
                                    <div className="w-full bg-foam border-gray-800 bg-cover shadow-[inset_6px_6px_8px_-2px_rgba(0,0,0,0.6)] bg-center  bg-no-repeat p-1.5  rounded-md overflow-hidden ">
                                        <div
                                            className={`relative w-full bg-gray-200 rounded-md inset-0 ${text} text-[2px] p-0.5`}
                                        >
                                            <img
                                                className="absolute inset-0 w-full h-full"
                                                src={cardfrontImg}
                                                alt="card front"
                                            />
                                            <div className="relative pb-1.5 w-full h-full">
                                                <div
                                                    className={`flex flex-col w-full h-full rounded border-4 ${border} bg-orange-100`}
                                                >
                                                    <p className="uppercase text-center leading-tight">
                                                        borflab // <strong>top secret</strong> // specimen
                                                    </p>
                                                    <hr className={`border-0 h-px ${bg}`} />
                                                    <div className="flex-grow flex overflow-hidden p-px">
                                                        <img
                                                            src={`https://serveproxy.com/?url=https://gateway.pinata.cloud/ipfs/${monster.ImageCid}`}
                                                            className="mr-auto ml-auto h-full object-cover"
                                                            alt="output"
                                                        />
                                                    </div>
                                                    <hr className={`border-0 h-px ${bg}`} />
                                                    <div className="flex justify-between p-px">
                                                        <h1 className="leading-none uppercase font-bold text-xs">
                                                            {monster.Name}
                                                        </h1>
                                                    </div>
                                                    <p
                                                        className={`p-px leading-none text-xs font-bold text-orange-400 uppercas ${bg}`}
                                                    >
                                                        {monster.Biome}
                                                    </p>
                                                    <p className="leading-tight p-px">
                                                        <strong className="uppercase">observation: </strong>
                                                        {monster.Lore}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
            <div className="w-full h-4 border-b-2 border-black shadow-md">
                <img src={borderBottomImg} className={`h-full w-full object-cover`} />
            </div>
            <div className="w-full px-4 flex gap-2 items-center justify-between py-4 text-lg">
                <button
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page <= 1 || loading}
                    className="w-6 h-6 p-0 bg-transparent border-none "
                >
                    <img
                        src={pagination.page <= 1 || loading ? buttonDisabledImg : buttonActiveImg}
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
                        <span className="text-xs" leading-tight>
                            specimen tray no.{" "}
                        </span>
                    </div>
                </div>

                <button
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={pagination.page >= pagination.pages || loading}
                    className="w-6 h-6 p-0 bg-transparent border-none"
                >
                    <img
                        src={pagination.page >= pagination.pages || loading ? buttonDisabledImg : buttonActiveImg}
                        alt="Next"
                        className="w-full h-full object-contain -scale-x-100"
                    />
                </button>
            </div>
        </div>
    );
}
