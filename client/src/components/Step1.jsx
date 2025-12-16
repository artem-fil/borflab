import { useWallets } from "@privy-io/react-auth/solana";
import { useState, useEffect, useRef } from "react";
import posterImg from "../assets/poster.png";
import igniterImg from "../assets/igniter.png";
import placeholderImg from "../assets/placeholder.svg";
import api from "../api";

import { STONES } from "../config.js";

export default function Step1({ next, setSpecimen, stone, setStone }) {
    const { wallets } = useWallets();
    const fileInputRef = useRef(null);
    const typingRef = useRef(false);
    const [preview, setPreview] = useState(null);
    const [displayed, setDisplayed] = useState("");
    const [showStoneDialog, setShowStoneDialog] = useState(false);
    const [availableStones, setAvailableStones] = useState([]);
    const [loading, setLoading] = useState(true);

    const solanaWallet = wallets[0];

    async function appendTypedLine(line = "") {
        if (!line) return;

        typingRef.current = true;

        for (let i = 0; i < line.length; i++) {
            setDisplayed((prev) => prev + line[i]);
            await new Promise((r) => setTimeout(r, 30));
        }

        setDisplayed((prev) => prev + "\n");
        typingRef.current = false;
    }

    useEffect(() => {
        if (solanaWallet?.address) {
            loadStonesData();
        }
    }, [solanaWallet?.address]);

    async function loadStonesData() {
        setLoading(true);
        try {
            const stones = await api.getStones();

            setAvailableStones(stones);
        } catch (error) {
            console.error("Error loading stones data:", error);
            setAvailableStones({});
        } finally {
            setLoading(false);
        }
    }

    const handleStoneSelect = async (stone) => {
        if (stone.SparkCount > 0) {
            setStone(stone);
            setShowStoneDialog(false);
        }
        await appendTypedLine(`${stone.Type} selected.`);
        if (preview) {
            await appendTypedLine("Ready for analysis.");
            await appendTypedLine("Status: waiting for approval…");
        }
    };

    const MAX_FILE_SIZE_MB = 10;
    const MAX_DIMENSION = 2000;

    const handleFileChange = async (e) => {
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
        await appendTypedLine("Specimen uploaded.");
        if (stone) {
            await appendTypedLine("Ready for analysis.");
            await appendTypedLine("Status: waiting for approval…");
        }
    };

    const isNextEnabled = preview && stone;

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
                    className="flex items-center justify-center absolute aspect-square cursor-pointer"
                    style={{ top: "13%", left: "13%", width: "25%" }}
                    onClick={() => setShowStoneDialog(true)}
                >
                    {stone && <img src={STONES[stone.Type].thumb} alt={stone.Type} className="h-1/2 object-cover" />}
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
                    className="absolute text-xs text-lime-500 overflow-y-auto"
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
                            {availableStones.map(({ Type, MintAddress, SparkCount }) => {
                                const isDisabled = SparkCount <= 0;
                                const formatted = SparkCount > 0 ? SparkCount.toString().padStart(2, "0") : "00";

                                return (
                                    <button
                                        key={Type}
                                        onClick={() =>
                                            !isDisabled && handleStoneSelect({ Type, MintAddress, SparkCount })
                                        }
                                        disabled={isDisabled}
                                        className={`flex flex-col items-center rounded-lg transition-colors ${
                                            isDisabled
                                                ? "opacity-50 cursor-not-allowed grayscale"
                                                : "hover:border-lime-500"
                                        }`}
                                    >
                                        <div
                                            className={`w-14 h-14 rounded-full mb-2 flex items-center justify-center ${
                                                isDisabled ? "bg-gray-800" : "bg-gray-700"
                                            }`}
                                        >
                                            <img src={STONES[Type].thumb} alt={Type} />
                                        </div>
                                        <span className={`text-xs ${isDisabled ? "text-gray-500" : "text-white"}`}>
                                            {Type}
                                        </span>
                                        <span className={`text-xs ${isDisabled ? "text-gray-500" : "text-white"}`}>
                                            {formatted}
                                        </span>
                                    </button>
                                );
                            })}
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
