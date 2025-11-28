import { useState, useEffect, useRef } from "react";
import posterImg from "../assets/poster.png";
import igniterImg from "../assets/igniter.png";
import placeholderImg from "../assets/placeholder.svg";

import agateImage from "../assets/agate.png";
import jadeImage from "../assets/jade.png";
import topazImage from "../assets/topaz.png";
import quartzImage from "../assets/quartz.png";
import sapphireImage from "../assets/sapphire.png";
import amazoniteImage from "../assets/amazonite.png";
import rubyImage from "../assets/ruby.png";

const STONES = [
    { id: "agate", name: "Agate", image: agateImage },
    { id: "sapphire", name: "Sapphire", image: sapphireImage },
    { id: "ruby", name: "Ruby", image: rubyImage },
    { id: "quartz", name: "Quartz", image: quartzImage },
    { id: "amazonite", name: "Amazonite", image: amazoniteImage },
    { id: "jade", name: "Jade", image: jadeImage },
    { id: "topaz", name: "Topaz", image: topazImage },
];

export default function Step1({ next, setSpecimen, stone, setStone }) {
    const fileInputRef = useRef(null);
    const [preview, setPreview] = useState(null);
    const [displayed, setDisplayed] = useState("");
    const [showStoneDialog, setShowStoneDialog] = useState(false);
    const [index, setIndex] = useState(0);

    const MAX_FILE_SIZE_MB = 10;
    const MAX_DIMENSION = 2000;

    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = () => {
            let img = new Image();
            img.onload = () => {
                const needResize =
                    file.size / 1024 / 1024 > MAX_FILE_SIZE_MB || Math.max(img.width, img.height) > MAX_DIMENSION;

                if (needResize) {
                    let scale = 1;
                    if (img.width > img.height) {
                        scale = MAX_DIMENSION / img.width;
                    } else {
                        scale = MAX_DIMENSION / img.height;
                    }

                    const canvas = document.createElement("canvas");
                    canvas.width = Math.round(img.width * scale);
                    canvas.height = Math.round(img.height * scale);

                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                    const resizedDataUrl = canvas.toDataURL(file.type || "image/jpeg");
                    setPreview(resizedDataUrl);
                    setSpecimen(resizedDataUrl);
                } else {
                    setPreview(reader.result);
                    setSpecimen(reader.result);
                }
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    };

    const handleStoneSelect = (stone) => {
        setStone(stone);
        setShowStoneDialog(false);
    };

    const isNextEnabled = preview && stone;

    const text = "Specimen uploaded. Ready for analysis. Status: waiting for approval…";

    useEffect(() => {
        if (preview && index < text.length) {
            const timeout = setTimeout(() => {
                setDisplayed((prev) => prev + text[index]);
                setIndex((i) => i + 1);
            }, 40);
            return () => clearTimeout(timeout);
        }
    }, [index, preview, text]);

    return (
        <div className="flex flex-col items-center h-full justify-between">
            <div className="flex-1 flex items-center justify-center overflow-hidden">
                <img src={posterImg} alt="poster" className="max-h-full max-w-full object-contain" />
            </div>
            <div
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center h-36 w-10/12 rounded-t-md border-t border-white/80 backdrop-blur-sm shadow-md text-white"
            >
                <input
                    onChange={handleFileChange}
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden "
                />
                {preview ? (
                    <img src={preview} alt="uploaded specimen" className="max-h-32" />
                ) : (
                    <div className="flex flex-col gap-2 items-center justify-center">
                        <strong className="uppercase font-semibold">place specimen here</strong>
                        <img src={placeholderImg} alt="placeholder" />
                        <span className="text-sm">JPG, PNG, JPEG // 10 Mb max</span>
                    </div>
                )}
            </div>
            <div className="relative w-full">
                <img src={igniterImg} onClick={next} alt="igniter" className="w-full h-auto object-contain" />
                {/* stone dialog */}
                <div
                    className="absolute aspect-square cursor-pointer"
                    style={{ top: "13%", left: "13%", width: "25%" }}
                    onClick={() => setShowStoneDialog(true)}
                >
                    {stone && <img src={stone.image} alt={stone.name} className="w-full h-full object-cover" />}
                </div>
                {/* submit */}
                <button
                    type="button"
                    onClick={() => isNextEnabled && next()}
                    disabled={!isNextEnabled}
                    aria-disabled={!isNextEnabled}
                    className={`rounded-full aspect-square absolute
            ${isNextEnabled ? "animate-pulse-button" : " cursor-not-allowed"}`}
                    style={{ top: "55%", left: "18%", width: "14%" }}
                />
                {/* monitor */}
                <div
                    className="absolute text-xs text-lime-500"
                    style={{
                        top: "17%",
                        left: "49%",
                        width: "37%",
                        aspectRatio: "1 / 1.1",
                    }}
                >
                    <div
                        className="absolute inset-0 pointer-events-none animate-scan"
                        style={{
                            background:
                                "linear-gradient(180deg, rgba(0,255,0,0) 0%, rgba(0,255,0,0.8) 50%, rgba(0,255,0,0) 100%)",
                            backgroundRepeat: "no-repeat",
                            backgroundSize: "100% 8%",
                            mixBlendMode: "screen",
                            opacity: 0.7,
                        }}
                    />
                    <p>BORFLAB 37.987-B</p>
                    <span className="whitespace-pre-wrap leading-tight">{displayed}</span>
                    <span className="animate-pulse">▋</span>
                </div>
            </div>
            {showStoneDialog && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-10 p-4">
                    <div className="bg-gray-900 border border-lime-500 rounded-lg p-6 max-w-md w-full">
                        <h3 className="text-lime-500 text-lg font-bold mb-4 text-center">SELECT STONE</h3>
                        <div className="grid grid-cols-3 gap-4">
                            {STONES.map(({ id, name, image }) => (
                                <button
                                    key={id}
                                    onClick={() => handleStoneSelect({ id, name, image })}
                                    className="flex flex-col items-center rounded-lg hover:border-lime-500 transition-colors"
                                >
                                    <div className="w-14 h-14 bg-gray-700 rounded-full mb-2 flex items-center justify-center">
                                        <img src={image} alt="" />
                                    </div>
                                    <span className="text-white text-xs">{name}</span>
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={() => setShowStoneDialog(false)}
                            className="mt-6 w-full py-2 border border-lime-500 text-lime-500 rounded-lg hover:bg-lime-500/10 transition-colors"
                        >
                            CANCEL
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
