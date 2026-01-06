import cardbackImg from "@images/card-back.png";
import cardfrontImg from "@images/card-front.png";

import { useState } from "react";

import { STONES, BIOMES } from "../config.js";

export default function Card({ monster }) {
    const [flipped, setFlipped] = useState(false);
    const {
        Name,
        Habitat,
        Species,
        Biome,
        Stone,
        Lore,
        Abilities,
        MovementClass,
        Behaviour,
        Personality,
        ImageCid,
        Created,
    } = monster;
    const { border, bg, text } = BIOMES[Biome];

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
                className={`absolute inset-0 w-full ${text}  text-xs p-1 transition-all ease-out`}
                style={{
                    aspectRatio: "0.62 / 1",
                    backfaceVisibility: "hidden",
                    transform: "rotateY(180deg)",
                }}
            >
                <img className="absolute inset-0 w-full h-full" src={cardbackImg} alt="card back" />
                <div className="relative p-1.5 pb-8 rounded-2xl w-full h-full">
                    <div
                        className={`relative flex flex-col border-4 rounded-xl w-full outline-4 outline-orange-100 h-full ${border} bg-orange-100`}
                    >
                        <p className="p-1 leading-none">SPECIMEN ANALYSIS LOG // DEPT:006</p>
                        <hr className={`border-0 h-0.5 ${bg}`} />
                        <div className=" flex w-full items-center">
                            <div className="p-1 h-32 w-8/12">
                                <img
                                    src={`https://serveproxy.com/?url=https://gateway.pinata.cloud/ipfs/${ImageCid}`}
                                    className="ml-auto mr-auto rounded h-full object-cover"
                                    alt="input image"
                                />
                            </div>
                            <div className={`border-0 w-0.5 h-full ${bg}`} />
                            <div className="p-1 w-4/12 h-32 flex flex-col gap-1">
                                <img src={STONES[Stone]?.image} className="object-cover" alt="borfstone" />
                                <strong className="mx-1 text-center uppercase py-1 bg-red-800 text-white">
                                    common
                                </strong>
                            </div>
                        </div>
                        <hr className={`border-0 h-0.5 ${bg}`} />
                        <p className=" leading-none p-1">
                            <strong className="uppercase">BORFOLOGIST ID: </strong>
                            {`# PSM-0000001-25/I`}
                        </p>
                        <hr className={`border-0 h-0.5 ${bg}`} />
                        <p className=" leading-none p-1">
                            <strong className="uppercase">spiral index: </strong>
                            {`[23/840K BORF’S][3/164.4K ${"unknown"}][${Biome}: 001]`}
                        </p>
                        <hr className={`border-0 h-0.5 ${bg}`} />
                        <p className="leading-none p-1">
                            <strong className="uppercase">issue date: </strong>
                            {`${new Date(Created).toLocaleDateString()}`}
                        </p>
                        <strong className={`p-1 ${bg} text-white uppercase`}>[borf profile]</strong>
                        <p className="leading-none p-1">
                            <strong className="uppercase">movement class: </strong>
                            {MovementClass}
                        </p>
                        <hr className={`border-0 h-0.5 ${bg}`} />
                        <p className="leading-none p-1">
                            <strong className="uppercase">behaviour: </strong>
                            {Behaviour}
                        </p>
                        <hr className={`border-0 h-0.5 ${bg}`} />
                        <p className="leading-none p-1">
                            <strong className="uppercase">personality: </strong>
                            {Personality}
                        </p>
                        <hr className={`border-0 h-0.5 ${bg}`} />
                        <p className="leading-none p-1">
                            <strong className="uppercase">abilities: </strong>
                            {Abilities}
                        </p>
                        <hr className={`border-0 h-0.5 ${bg}`} />
                        <p className="leading-none p-1">
                            <strong className="uppercase">habitat: </strong>
                            {Habitat}
                        </p>
                    </div>
                </div>
            </div>

            {/* front */}
            <div className={`w-full absolute inset-0 ${text} text-xs p-1`} style={{ backfaceVisibility: "hidden" }}>
                <img className="absolute inset-0 w-full h-full" src={cardfrontImg} alt="card front" />
                <div className="relative p-1.5 pb-8 w-full h-full">
                    <div className={`flex flex-col w-full h-full rounded-2xl border-4 ${border} bg-orange-100`}>
                        <p className="uppercase text-center">
                            borflab // <strong>top secret</strong> // specimen
                        </p>
                        <hr className={`border-0 h-0.5 ${bg}`} />
                        <div className="flex-grow flex overflow-hidden p-1">
                            <img
                                src={`https://serveproxy.com/?url=https://gateway.pinata.cloud/ipfs/${ImageCid}`}
                                className="mr-auto ml-auto h-full object-cover"
                                alt="output"
                            />
                        </div>
                        <hr className={`border-0 h-0.5 ${bg}`} />
                        <div className="flex justify-between p-1">
                            <div className="flex flex-col justify-between">
                                <h1 className="leading-tight uppercase font-bold text-lg">{Name}</h1>
                                <p className="uppercase leading-none text-sm">
                                    species: <strong>{Species}</strong>
                                </p>
                            </div>
                            <div className={`border-2 ${border}`}>
                                <h1 className="p-1 text-lg font-bold text-center">I</h1>
                                <hr className={`border-0 h-0.5 ${bg}`} />
                                <span className="p-1">chapter</span>
                            </div>
                        </div>
                        <p className={`p-1 text-sm uppercase text-gray-100 ${bg}`}>
                            biome: <strong className="font-bold text-orange-400">{Biome}</strong>
                        </p>
                        <p className="leading-tight p-1">
                            <strong className="uppercase">observation: </strong>
                            {Lore}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
