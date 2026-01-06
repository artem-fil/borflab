import { useState } from "react";
import posterImg from "@images/poster.png";
import designatorImg from "@images/designator.png";

export default function Step2({ next, setBiome }) {
    const [selectedBiome, setSelectedBiome] = useState(null);

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
                <img src={posterImg} alt="poster" className="max-h-full max-w-full object-contain" />
            </div>

            <div className="relative w-full">
                {/* amazonia */}
                <button
                    type="button"
                    onClick={() => setSelectedBiome("amazonia")}
                    aria-pressed={selectedBiome === "amazonia"}
                    className={`rounded-sm absolute cursor-pointer
            ${selectedBiome === "amazonia" ? "ring-2 ring-green-500 ring-offset ring-offset-black/40" : ""}`}
                    style={{ top: "17%", left: "13%", width: "21%", height: "12%" }}
                />

                {/* plushland */}
                <button
                    type="button"
                    onClick={() => setSelectedBiome("plushland")}
                    aria-pressed={selectedBiome === "plushland"}
                    className={`rounded-sm absolute cursor-pointer
            ${selectedBiome === "plushland" ? "ring-2 ring-purple-500 ring-offset ring-offset-black/40" : ""}`}
                    style={{ top: "34%", left: "13%", width: "21%", height: "12%" }}
                />

                {/* submit */}
                <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    aria-disabled={!canSubmit}
                    className={`rounded-full aspect-square absolute
            ${canSubmit ? "animate-pulse-button" : " cursor-not-allowed"}`}
                    style={{ top: "53%", left: "78%", width: "12%" }}
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
