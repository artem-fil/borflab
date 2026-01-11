import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import posterImg from "@images/poster.png";
import igniterImg from "@images/igniter.png";
import placeholderImg from "@images/placeholder.svg";
import api from "../api";

import { STONES } from "../config.js";

export default function Step1({ next, setSpecimen, stone, setStone }) {
    const fileInputRef = useRef(null);
    const typingRef = useRef(false);
    const [preview, setPreview] = useState(null);
    const [displayed, setDisplayed] = useState("");
    const [showStoneDialog, setShowStoneDialog] = useState(false);
    const [availableStones, setAvailableStones] = useState([]);
    const [loading, setLoading] = useState(true);

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
        loadStonesData();
    }, []);

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

    const handleStoneSelect = async ({ Type, SparkCount }) => {
        if (SparkCount > 0) {
            setStone({ Type, SparkCount });
            setShowStoneDialog(false);
        }
        await appendTypedLine(`${Type} selected.`);
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
        reader.onloadend = async () => {
            const img = new Image();
            img.onload = async () => {
                let blob;

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

                    blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.8));
                } else {
                    blob = await toBlob(reader.result);
                }

                const previewUrl = URL.createObjectURL(blob);
                setPreview(previewUrl);
                setSpecimen(blob);
                setShowStoneDialog(true);
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

    function toBlob(fileOrDataUrl) {
        return new Promise((resolve) => {
            if (fileOrDataUrl instanceof Blob) {
                resolve(fileOrDataUrl);
            } else {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement("canvas");
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(img, 0, 0);
                    canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.8);
                };
                img.src = fileOrDataUrl;
            }
        });
    }

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
                    {stone && <img src={STONES[stone.Type].image} alt={stone.Type} className="h-1/2 object-cover" />}
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
            {showStoneDialog &&
                createPortal(
                    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4">
                        {loading ? (
                            <svg
                                className="animate-spin h-10 w-10 mb-4 text-white"
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                                />
                            </svg>
                        ) : (
                            <div className="bg-gray-900 border border-lime-500 rounded-lg p-6 max-w-md w-full flex flex-col gap-5">
                                <h3 className="text-lime-500 text-lg font-bold text-center">SELECT STONE</h3>
                                <div className="grid grid-cols-4 gap-3">
                                    {Object.entries(availableStones).map(([Type, SparkCount]) => {
                                        const isDisabled = SparkCount <= 0;
                                        const formatted =
                                            SparkCount > 0 ? SparkCount.toString().padStart(2, "0") : "00";

                                        return (
                                            <button
                                                key={Type}
                                                onClick={() => !isDisabled && handleStoneSelect({ Type, SparkCount })}
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
                                                    <img src={STONES[Type].image} alt={Type} />
                                                </div>
                                                <span
                                                    className={`text-xs ${isDisabled ? "text-gray-500" : "text-white"}`}
                                                >
                                                    {Type}
                                                </span>
                                                <span
                                                    className={`text-xs ${isDisabled ? "text-gray-500" : "text-white"}`}
                                                >
                                                    {formatted}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                                <div className="flex gap-6">
                                    <Link
                                        className="w-1/2 text-center uppercase py-2 border border-lime-500 text-lime-500 rounded-lg hover:bg-lime-500/10 transition-colors"
                                        to="/storage"
                                    >
                                        storage
                                    </Link>
                                    <button
                                        onClick={() => setShowStoneDialog(false)}
                                        className="w-1/2 text-center  uppercase py-2 border border-lime-500 text-lime-500 rounded-lg hover:bg-lime-500/10 transition-colors"
                                    >
                                        close
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>,
                    document.body
                )}
        </div>
    );
}
