import cardbackImg from "@images/card-back.png";
import cardfrontImg from "@images/card-front.png";
import watermarkImg from "@images/watermark.png";

import { useState } from "react";

import { BIOMES, STONES } from "../config.js";

export default function Card({ monster }) {
    const [flipped, setFlipped] = useState(false);
    const {
        Name,
        Height,
        Weight,
        UserId,
        Habitat,
        Species,
        Biome,
        Stone,
        Lore,
        Abilities,
        Size,
        Personality,
        ImageCid,
        Created,
    } = monster;

    const { border, bg, text, icon } = BIOMES[Biome];

    return (
        <div
            className="max-h-full font-exo  max-w-full h-full w-auto"
            style={{
                perspective: "1200px",
                aspectRatio: "0.62 / 1",
            }}
        >
            <div
                onClick={() => setFlipped(!flipped)}
                className="relative  cursor-pointer w-full h-full"
                style={{
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
                    <div className="relative p-2 pb-8 rounded-2xl w-full h-full">
                        <div
                            className="absolute rounded-2xl mx-1 mb-8 mt-1 bg-paper inset-0 z-10"
                            style={{
                                backgroundSize: "cover",
                                mixBlendMode: "multiply",
                                opacity: 1,
                            }}
                        />
                        <div
                            className={`relative flex flex-col border-4 rounded-xl w-full ring-orange-50 ring-4 h-full ${border} bg-orange-50`}
                        >
                            <p className="text-center p-1 leading-none text-accent">
                                SPECIMEN ANALYSIS LOG // DEPT:006 // CHAPTER I
                            </p>
                            <hr className={`border-0 h-0.5 ${bg}`} />
                            <div className=" flex w-full items-center">
                                <div className=" flex items-center p-1 h-24 w-1/3">
                                    <img
                                        src={`https://serveproxy.com/?url=https://gateway.pinata.cloud/ipfs/${ImageCid}`}
                                        className="ml-auto mr-auto rounded object-cover"
                                        alt="input image"
                                    />
                                </div>
                                <div className={`border-0 w-px h-full ${bg}`} />
                                <div
                                    className={`uppercase p-1 font-special w-2/3 h-24 flex flex-col justify-between ${text}`}
                                >
                                    <p>ISSUE DATE: {`${new Date(Created).toLocaleDateString()}`}</p>
                                    <p>SPIRAL INDEX: </p>
                                    <p>[23/840K BORF’S]</p>
                                    <p>[23/840K RUBY]</p>
                                    <p>[{Biome}: 001]</p>
                                </div>
                            </div>
                            <hr className={`border-0 h-0.5 ${bg}`} />
                            <p className=" leading-none p-1 text-lg">
                                <strong className={`uppercase  ${text}`}>BORFOLOGIST ID: </strong>
                                {`# ${UserId.slice(-6)}/I`}
                            </p>
                            <strong className={`p-2 ${bg} text-orange-50 uppercase text-xl`}>borf profile</strong>
                            <div className="p-1">
                                <strong className={`${text} uppercase`}>01. observation: </strong>
                                <p className="text-black leading-tight font-special">{Lore}</p>
                            </div>
                            <hr className={`border-0 h-0.5 ${bg}`} />
                            <div className="p-1">
                                <strong className={`${text} uppercase`}>02. personality: </strong>
                                <p className="text-black leading-tight font-special">{Personality}</p>
                            </div>
                            <hr className={`border-0 h-0.5 ${bg}`} />
                            <div className=" p-1">
                                <strong className={`${text} uppercase`}>03. abilities: </strong>
                                <p className="text-black leading-tight font-special">{Abilities}</p>
                            </div>
                            <hr className={`border-0 h-0.5 ${bg}`} />
                            <div className="p-1">
                                <strong className={`${text} uppercase`}>04. habitat: </strong>
                                <p className="text-black leading-tight font-special">{Habitat}</p>
                            </div>
                            <hr className={`border-0 h-0.5 ${bg}`} />
                            <p className="text-right p-1 leading-none text-accent">
                                filed under BORFLAB DEPT.006 // Spiral confirmed
                            </p>
                        </div>
                    </div>
                </div>

                {/* front */}
                <div className={`w-full absolute inset-0 ${text} text-xs p-1`} style={{ backfaceVisibility: "hidden" }}>
                    <img className="absolute inset-0 w-full h-full" src={cardfrontImg} alt="card front" />
                    <div className="relative p-2.5 pb-9 w-full h-full ">
                        <div
                            className="absolute rounded-2xl mx-1 mb-8 mt-1 bg-paper inset-0 z-10"
                            style={{
                                backgroundSize: "cover",
                                mixBlendMode: "multiply",
                                opacity: 1,
                            }}
                        />
                        <div
                            className={`relative flex flex-col w-full h-full rounded-2xl border-4 ring-orange-50 ring-4 ${border} bg-orange-50`}
                        >
                            <div className="p-1.5 uppercase">
                                <p>borflab exo-bio division</p>
                                <p>security class: top secret</p>
                                <p>document type: specimen data card</p>
                            </div>
                            <hr className={`border-0 h-0.5 ${bg}`} />
                            <div className="relative flex-grow flex overflow-hidden p-1">
                                <img
                                    src={`https://serveproxy.com/?url=https://gateway.pinata.cloud/ipfs/${ImageCid}`}
                                    className="max-h-full max-w-full w-auto h-auto object-contain mr-auto ml-auto z-10"
                                    alt="output"
                                />
                                <img src={watermarkImg} className="absolute right-0 w-2/3 top-0" alt="watermark" />
                            </div>
                            <hr className={`border-0 h-0.5 ${bg}`} />
                            <div className="flex justify-between">
                                <div className="flex flex-col gap-2 p-1 grow text-md ">
                                    <p className="flex gap-2 items-baseline">
                                        ID:
                                        <span
                                            className={`leading-none grow border-b ${border} uppercase  font-special text-black`}
                                        >
                                            {Name}
                                        </span>
                                    </p>
                                    <p className="flex gap-2 items-baseline">
                                        CLASS:
                                        <span
                                            className={`leading-none grow border-b ${border} uppercase  font-special text-black`}
                                        >
                                            {Species}
                                        </span>
                                    </p>
                                    <p className="flex gap-2 items-baseline">
                                        SIZE:{" "}
                                        <span
                                            className={`leading-none grow border-b ${border} font-special text-black`}
                                        >
                                            {`H: ${Height}cm / W: ${Weight}kg`}
                                        </span>
                                    </p>
                                </div>
                                <hr className={`w-0.5 h-20 ${bg}`} />
                                <div className="p-1 w-20 h-20">
                                    <img src={STONES[Stone]?.image} className="w-full" alt="borfstone" />
                                </div>
                            </div>
                            <div className={`flex text-xl items-center gap-1 p-1 uppercase text-orange-50 ${bg}`}>
                                <img src={icon} className="w-10 opacity-50" alt="" />
                                <span>
                                    bio-sector: <strong className="font-bold text-accent">{Biome}</strong>
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
