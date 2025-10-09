import { useState } from "react";

import card1 from "../assets/card1.png";
import card2 from "../assets/card2.png";

export default function Library() {
    const [sort, setSort] = useState(false);
    const [selected, setSelected] = useState(null);

    const images = [card1, card2];

    const totalSlots = 9;
    const filled = images.slice(0, totalSlots);
    const emptyCount = totalSlots - filled.length;
    const slots = [
        ...filled.map((src) => ({ type: "image", src })),
        ...Array.from({ length: emptyCount }, () => ({ type: "empty" })),
    ];

    return (
        <div className="flex-grow flex flex-col items-center">
            <div className="w-full flex justify-between px-6">
                <div className="flex flex-col">
                    <h2 className="text-white font-bold text-xl">BORFcard Library</h2>
                    <span className="text-xs">Total cards in collection: {String(images.length).padStart(3, "0")}</span>
                </div>
                <div className="relative">
                    <button className="h-full bg-red-500" onClick={() => setSort(!sort)}>
                        sort
                    </button>
                    <div
                        className={` absolute top-full right-0 flex flex-col items-end text-white bg-black/90 rounded-md uppercase transform transition-all duration-300 origin-top-right z-10 ${
                            sort ? "scale-y-100 opacity-100" : "scale-y-0 opacity-0"
                        }`}
                        style={{ transformOrigin: "top right" }}
                    >
                        {["biome", "borfstone", "date"].map((i) => {
                            return (
                                <div key={i} className="p-2">
                                    {i}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
            <div className="w-full h-4 bg-gray-100 border-b-2 border-black shadow-md"></div>
            <div className="w-full flex-grow bg-stone-800 px-6 py-2">
                {selected ? (
                    <div className="w-full h-full flex items-center justify-center">
                        <img
                            src={selected}
                            alt="selected"
                            className="max-h-full max-w-full object-contain cursor-pointer transition-transform duration-300 hover:scale-105"
                            onClick={() => setSelected(null)}
                        />
                    </div>
                ) : (
                    <div className="grid grid-cols-3 gap-x-4 gap-y-2 w-full h-full">
                        {slots.map((slot, i) => (
                            <div key={i} className="flex flex-col gap-1 items-center">
                                {slot.type === "image" ? (
                                    <div className="w-full aspect-[3/5] bg-gray-200 rounded-md overflow-hidden">
                                        <img
                                            onClick={() => setSelected(slot.src)}
                                            src={slot.src}
                                            alt={`specimen ${i + 1}`}
                                            className="h-full object-cover"
                                        />
                                    </div>
                                ) : (
                                    <div className="w-full aspect-[3/5] bg-gray-100 shadow-inner rounded-md" />
                                )}
                                <span className="text-white uppercase text-xs">specimen 00{i + 1}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <div className="w-full h-4 bg-gray-100 shadow-md"></div>
            <div>hello</div>
        </div>
    );
}
