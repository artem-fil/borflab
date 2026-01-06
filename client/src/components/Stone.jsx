import cardbackImg from "@images/card-back.png";
import cardfrontImg from "@images/card-front.png";

import { useState } from "react";

import { STONES } from "../config.js";

export default function Stone({ type }) {
    const [flipped, setFlipped] = useState(false);
    const { image, lore, rarity, appearance, personality, abilities, species } = STONES[type];

    return (
        <div
            onClick={() => setFlipped(!flipped)}
            className="w-full relative cursor-pointer"
            style={{
                perspective: "1200px",
                aspectRatio: "0.62 / 1",
                transformStyle: "preserve-3d",
                transition: "transform 0.6s cubic-bezier(0.4,0.2,0.2,1)",
                transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
            }}
        >
            {/* back */}
            <div
                className="absolute inset-0 w-full text-green-800 text-xs p-1 transition-all ease-out"
                style={{
                    backfaceVisibility: "hidden",
                    transform: "rotateY(180deg)",
                }}
            >
                <img className="absolute inset-0 w-full h-full" src={cardbackImg} alt="card back" />
                <div className="relative p-2.5 pb-9 w-full h-full">
                    <div className="flex flex-col w-full h-full rounded-xl border-4 border-green-800 bg-orange-100 outline outline-4 outline-orange-100">
                        <div className="flex justify-between items-center px-1">
                            <p className="uppercase text-2xl px-1 font-bold">{type}</p>
                            <img src={image} className="h-12 object-cover" />
                        </div>
                        <hr className="border-0 h-0.5 bg-green-800" />
                        <p className="px-1">
                            <strong>Lore: </strong>
                            {lore}
                        </p>
                        <hr className="border-0 h-0.5 bg-green-800" />
                        <p className="px-1">
                            <strong>Appearance effect:</strong> {appearance}
                        </p>
                        <hr className="border-0 h-0.5 bg-green-800" />
                        <p className="px-1">
                            <strong>Abilities effect:</strong> {abilities}
                        </p>
                        <hr className="border-0 h-0.5 bg-green-800" />
                        <p className="px-1">
                            <strong>Personality effect:</strong> {personality}
                        </p>
                    </div>
                </div>
            </div>

            {/* front */}
            <div
                className="absolute inset-0 w-full text-green-800 text-sm p-1"
                style={{ backfaceVisibility: "hidden" }}
            >
                <img className="absolute inset-0 w-full h-full" src={cardfrontImg} alt="card front" />
                <div className="relative p-2.5 pb-9 w-full h-full">
                    <div className="flex flex-col w-full h-full rounded-xl border-4 border-green-800 bg-orange-100 outline outline-4 outline-orange-100">
                        <p className="uppercase text-2xl px-1 font-bold">{type}</p>
                        <p className="px-1">
                            <strong>Species:</strong>
                            {species}
                        </p>
                        <div className="flex-grow flex overflow-hidden p-1">
                            <img src={image} className="mr-auto ml-auto h-full object-cover" alt="output" />
                        </div>
                        <hr className="border-0 h-0.5 bg-green-800" />
                        <div className="flex justify-between px-1">
                            <p>
                                <strong>Rarity:</strong> {rarity}
                            </p>
                            <p>
                                <strong>Gen-I:</strong>9000
                            </p>
                        </div>
                        <hr className="border-0 h-0.5 bg-green-800" />
                        <p className="px-1">
                            <strong>Location: </strong>Brandberg, Namibia
                        </p>
                        <p className="px-1">
                            <strong>Discovered: </strong>~100,000 BP Origin of Human Creative Cognition
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
