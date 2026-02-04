import { useState, useRef } from "react";
import poster2Img from "@images/poster02.png";
import designatorImg from "@images/designator.png";
import clickSound from "@sounds/click.ogg";

export default function Step2({ next, setBiome }) {
    const [selectedBiome, setSelectedBiome] = useState(null);

    const audioRef = useRef(new Audio(clickSound));
    audioRef.current.volume = 0.5;

    const canSubmit = !!selectedBiome;

    const handleSubmit = () => {
        if (canSubmit) {
            setBiome(selectedBiome);
            next();
        }
    };

    return (
        <div className="flex flex-col h-full justify-end">
            <div className="flex-1 flex items-center justify-center overflow-hidden">
                <img src={poster2Img} alt="poster" className="max-h-full max-w-full object-contain" />
            </div>

            <div className="relative w-full text-sm">
                {/* amazonia */}
                <button
                    type="button"
                    onClick={() => {
                        audioRef.current.play();
                        setSelectedBiome("amazonia");
                    }}
                    aria-pressed={selectedBiome === "amazonia"}
                    className={`absolute cursor-pointer
            ${selectedBiome === "amazonia" ? "text-green-500" : ""}`}
                    style={{ top: "20%", left: "7%", width: "25%", height: "12%" }}
                >
                    amazonia
                </button>
                {/* plushland */}
                <button
                    type="button"
                    onClick={() => {
                        audioRef.current.play();
                        setSelectedBiome("plushland");
                    }}
                    aria-pressed={selectedBiome === "plushland"}
                    className={`absolute cursor-pointer
            ${selectedBiome === "plushland" ? "text-purple-500" : ""}`}
                    style={{ top: "38%", left: "7%", width: "25%", height: "12%" }}
                >
                    plushland
                </button>
                <button
                    type="button"
                    onClick={() => {
                        audioRef.current.play();
                        setSelectedBiome("coralux");
                    }}
                    aria-pressed={selectedBiome === "coralux"}
                    className={`absolute cursor-pointer
            ${selectedBiome === "coralux" ? "text-cyan-500" : ""}`}
                    style={{ top: "20%", left: "38%", width: "25%", height: "12%" }}
                >
                    coralux
                </button>
                <button
                    type="button"
                    className={`absolute text-gray-500 cursor-not-allowed`}
                    style={{ top: "38%", left: "38%", width: "25%", height: "12%" }}
                >
                    unknown
                </button>
                <button
                    type="button"
                    className={`absolute text-gray-500 cursor-not-allowed`}
                    style={{ top: "20%", left: "68%", width: "25%", height: "12%" }}
                >
                    unknown
                </button>
                <button
                    type="button"
                    className={`absolute text-gray-500 cursor-not-allowed`}
                    style={{ top: "38%", left: "68%", width: "25%", height: "12%" }}
                >
                    unknown
                </button>
                {/* submit */}
                <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    aria-disabled={!canSubmit}
                    className={`rounded-full aspect-square absolute
            ${canSubmit ? "animate-pulse-button" : " cursor-not-allowed"}`}
                    style={{ top: "56.5%", left: "82.5%", width: "13%" }}
                />

                <img
                    src={designatorImg}
                    alt="designator"
                    className="w-full h-auto object-contain pointer-events-none select-none z-0"
                />
            </div>
        </div>
    );
}
