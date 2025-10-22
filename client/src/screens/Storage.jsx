import { useState } from "react";

import storageImage from "../assets/storage.jpg";
import agateImage from "../assets/agate.png";
import jadeImage from "../assets/jade.png";
import topazImage from "../assets/topaz.png";
import quartzImage from "../assets/quartz.png";
import sapphireImage from "../assets/sapphire.png";
import tanzaniteImage from "../assets/tanzanite.png";
import rubyImage from "../assets/ruby.png";

export default function Storage() {
    const [sort, setSort] = useState(false);
    const [selected, setSelected] = useState(null);

    return (
        <div className="flex-grow flex flex-col items-center text-white py-2">
            <div className="w-full flex justify-between px-6">
                <div className="flex flex-col">
                    <h2 className=" font-bold text-xl">BORFstone storage</h2>
                    <span className="text-xs">AUTHORIZED ACCESS ONLY // DEPT. 006</span>
                </div>
                <div className="relative">
                    <button className="h-full bg-red-500" onClick={() => setSort(!sort)}>
                        close
                    </button>
                </div>
            </div>
            <div className="w-full flex-grow">
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
                    <div className="relative">
                        <img
                            src={agateImage}
                            style={{
                                top: "35%",
                                left: "39.5%",
                                width: "20%",
                            }}
                            alt="agate"
                            className="absolute"
                        />
                        <div
                            className="flex flex-col gap-0.5 leading-none absolute text-xs text-lime-500"
                            style={{
                                top: "51%",
                                left: "39.5%",
                                width: "21%",
                            }}
                        >
                            <div className="">sparks</div>
                            <div className="flex justify-between">
                                <div className="text-left">agate</div>
                                <div className="text-right">01</div>
                            </div>
                        </div>
                        <img
                            src={jadeImage}
                            style={{
                                top: "21.5%",
                                left: "67%",
                                width: "20%",
                            }}
                            alt="jade"
                            className="absolute"
                        />
                        <div
                            className="flex flex-col gap-0.5 leading-none absolute text-xs text-lime-500"
                            style={{
                                top: "38%",
                                left: "66%",
                                width: "21%",
                            }}
                        >
                            <div className="">sparks</div>
                            <div className="flex justify-between">
                                <div className="text-left">jade</div>
                                <div className="text-right">01</div>
                            </div>
                        </div>
                        <img
                            src={topazImage}
                            alt="topaz"
                            style={{
                                top: "60%",
                                left: "39.5%",
                                width: "20%",
                            }}
                            className="absolute"
                        />
                        <div
                            className="flex flex-col gap-0.5 leading-none absolute text-xs text-lime-500"
                            style={{
                                top: "75.7%",
                                left: "39.5%",
                                width: "21%",
                            }}
                        >
                            <div className="">sparks</div>
                            <div className="flex justify-between">
                                <div className="text-left">topaz</div>
                                <div className="text-right">01</div>
                            </div>
                        </div>
                        <img
                            src={quartzImage}
                            style={{
                                top: "10.5%",
                                left: "11.5%",
                                width: "20%",
                            }}
                            alt="quartz"
                            className="absolute"
                        />
                        <div
                            className="flex flex-col gap-0.5 leading-none absolute text-xs text-lime-500"
                            style={{
                                top: "26.7%",
                                left: "10.6%",
                                width: "21%",
                            }}
                        >
                            <div className="">sparks</div>
                            <div className="flex justify-between">
                                <div className="text-left">quartz</div>
                                <div className="text-right">01</div>
                            </div>
                        </div>
                        <img
                            src={sapphireImage}
                            style={{
                                top: "59.5%",
                                left: "12%",
                                width: "20%",
                            }}
                            alt="sapphire"
                            className="absolute"
                        />
                        <div
                            className="flex flex-col gap-0.5 leading-none absolute text-xs text-lime-500"
                            style={{
                                top: "75.7%",
                                left: "10.6%",
                                width: "21%",
                            }}
                        >
                            <div className="">sparks</div>
                            <div className="flex justify-between">
                                <div className="text-left">sapphire</div>
                                <div className="text-right">01</div>
                            </div>
                        </div>
                        <img
                            src={tanzaniteImage}
                            style={{
                                top: "10.5%",
                                left: "40%",
                                width: "20%",
                            }}
                            alt="tanzanite"
                            className="absolute"
                        />
                        <div
                            className="flex flex-col gap-0.5 leading-none absolute text-xs text-lime-500"
                            style={{
                                top: "26.7%",
                                left: "39.5%",
                                width: "21%",
                            }}
                        >
                            <div className="">sparks</div>
                            <div className="flex justify-between">
                                <div className="text-left">tanzanite</div>
                                <div className="text-right">01</div>
                            </div>
                        </div>
                        <img
                            src={rubyImage}
                            style={{
                                top: "35%",
                                left: "11.5%",
                                width: "20%",
                            }}
                            alt="ruby"
                            className="absolute"
                        />
                        <div
                            className="flex flex-col gap-0.5 leading-none absolute text-xs text-lime-500"
                            style={{
                                top: "51%",
                                left: "10.6%",
                                width: "21%",
                            }}
                        >
                            <div className="">sparks</div>
                            <div className="flex justify-between">
                                <div className="text-left">ruby</div>
                                <div className="text-right">01</div>
                            </div>
                        </div>
                        <div
                            className="uppercase leading-none absolute text-xs text-lime-500"
                            style={{
                                top: "86%",
                                left: "10.6%",
                            }}
                        >
                            {`>>spark energy stable...`}
                        </div>
                        <div
                            className="uppercase leading-none absolute text-xs text-cyan-500"
                            style={{
                                top: "46%",
                                left: "67%",
                            }}
                        >
                            {`sparks >>`}
                        </div>
                        <img src={storageImage} alt="storage" className="w-full h-auto object-contain" />
                    </div>
                )}
            </div>
            <div>more sparks</div>
        </div>
    );
}
