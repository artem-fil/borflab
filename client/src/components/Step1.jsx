import igniterImg from "@images/igniter2.png";
import posterImg from "@images/poster01.png";
import alarmSound from "@sounds/alarm.ogg";
import clickSound from "@sounds/click.ogg";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import api from "../api";
import { PRODUCTS, STONES } from "../config.js";

export default function Step1({ next, setSpecimen, stone, setStone, biome, setBiome }) {
    const fileInputRef = useRef(null);
    const typingRef = useRef(false);
    const [preview, setPreview] = useState(null);
    const [displayed, setDisplayed] = useState("");
    const [showStoneDialog, setShowStoneDialog] = useState(false);
    const [isOpening, setIsOpening] = useState(false);
    const [availableStones, setAvailableStones] = useState(null);
    const [purchases, setAvailablePurchases] = useState([]);
    const [loading, setLoading] = useState(true);
    const audioRef = useRef(new Audio(clickSound));
    const alarmRef = useRef(new Audio(alarmSound));
    audioRef.current.volume = 0.5;
    alarmRef.current.volume = 0.5;

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
            const { Stones, Purchases } = await api.getStones();

            setAvailableStones(Stones);
            setAvailablePurchases(Purchases);
        } catch (error) {
            console.error("Error loading stones data:", error);
            setAvailableStones(null);
            setAvailablePurchases([]);
        } finally {
            setLoading(false);
        }
    }

    const handleStoneSelect = async ({ Type, SparkCount }) => {
        if (SparkCount > 0) {
            alarmRef.current.play();
            setStone({ Type, SparkCount });
            setShowStoneDialog(false);
        }

        if (!preview) {
            await appendTypedLine(`${Type} selected.`);
        }
    };

    const openPack = async (purchaseId) => {
        try {
            setIsOpening(true);
            const { Purchase } = await api.openPurchase(purchaseId);
            loadStonesData();
        } catch (e) {
            console.error(e);
        } finally {
            setIsOpening(false);
        }
    };

    const MAX_FILE_SIZE_MB = 5;
    const MAX_DIMENSION = 1024;

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

    const isNextEnabled = preview && stone && biome;

    return (
        <div className="flex flex-col items-center h-full px-4">
            {/* POSTER */}

            <div className="flex items-center justify-center overflow-hidden">
                <img src={posterImg} alt="poster" className="max-h-80 object-contain" />
            </div>

            <div className="relative w-full mt-auto">
                <img src={igniterImg} onClick={next} alt="igniter" className="w-full h-auto object-contain" />

                {/* image input */}

                <div
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute p-px"
                    style={{
                        top: "11%",
                        left: "11%",
                        width: "40%",
                        aspectRatio: "1 / 1.2",
                    }}
                >
                    <div className="rounded pointer-events-none absolute inset-0 z-10 mix-blend-multiply backdrop-blur-[0.5px] backdrop-saturate-[80%] bg-[radial-gradient(circle_at_30%_40%,rgba(120,150,90,0.25),rgba(30,60,40,0.55))]" />
                    <div
                        className="absolute inset-0 pointer-events-none animate-scan"
                        style={{
                            background:
                                "linear-gradient(180deg, rgba(63,229,153,0) 0%, rgba(63,229,153,0.8) 50%, rgba(63,229,153,0) 100%)",
                            backgroundRepeat: "no-repeat",
                            backgroundSize: "100% 8%",
                            mixBlendMode: "screen",
                            opacity: 0.7,
                        }}
                    />

                    <input
                        onChange={handleFileChange}
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden "
                    />

                    {preview ? (
                        <img src={preview} alt="uploaded specimen" className="rounded max-h-full" />
                    ) : (
                        <div className="flex flex-col gap-2 justify-center text-primary">
                            <strong className="text-sm uppercase font-semibold">[tap to capture]</strong>

                            <span className="text-xs">JPG, PNG. 10MB MAX</span>

                            <span className="text-xs whitespace-pre-wrap leading-tight">{displayed}</span>

                            <span className="text-xs animate-pulse">▋</span>
                        </div>
                    )}
                </div>
                {/* stone input */}
                <div
                    onClick={() => setShowStoneDialog(true)}
                    className="rounded-xl absolute cursor-pointer"
                    style={{
                        top: "11%",
                        left: "60%",
                        width: "32%",
                        aspectRatio: "1 / 1",
                    }}
                >
                    <div
                        className="left-1/2  -translate-x-1/2 bottom-4 absolute overflow-hidden"
                        style={{
                            width: "54%",
                            height: "54%",
                        }}
                    >
                        <div
                            className={`w-full h-full transition-transform duration-500 ease-out relative ${
                                stone ? "translate-y-0" : "translate-y-[110%]"
                            }`}
                        >
                            {stone && (
                                <div
                                    className="absolute inset-0 w-[100%] m-auto h-[80%] animate-pulse"
                                    style={{
                                        background: `radial-gradient(circle, ${STONES[stone.Type].color} 0%, ${STONES[stone.Type].color}50 80%, transparent 100%)`,
                                        filter: "blur(2px)",
                                        borderRadius: "50%",
                                        zIndex: 0,
                                    }}
                                />
                            )}
                            <img
                                src={STONES[stone?.Type]?.image}
                                alt={stone?.Type}
                                className="w-full h-full object-contain relative z-10"
                            />
                            {stone && (
                                <div
                                    className="absolute inset-0 z-20 pointer-events-none mix-blend-screen"
                                    style={{
                                        color: STONES[stone.Type].color,
                                        filter: "brightness(1.5)",
                                    }}
                                >
                                    <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
                                        <filter id="arc">
                                            <feTurbulence
                                                type="fractalNoise"
                                                baseFrequency="0.01 0.15"
                                                numOctaves="2"
                                                seed="1"
                                            >
                                                <animate
                                                    attributeName="seed"
                                                    from="1"
                                                    to="20"
                                                    dur="0.8s"
                                                    repeatCount="indefinite"
                                                />
                                            </feTurbulence>
                                            <feColorMatrix
                                                values="0 0 0 0 1
                                           0 0 0 0 1
                                           0 0 0 0 1
                                           0 0 0 16 -12"
                                            />
                                            <feComposite operator="in" in2="SourceGraphic" />
                                        </filter>
                                        <rect width="100%" height="80%" fill="currentColor" filter="url(#arc)" />
                                    </svg>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* submit */}
                <button
                    type="button"
                    onClick={() => isNextEnabled && next()}
                    disabled={!isNextEnabled}
                    aria-disabled={!isNextEnabled}
                    className={`rounded-full aspect-square absolute

${isNextEnabled ? "" : " cursor-not-allowed backdrop-grayscale"}`}
                    style={{ top: "46%", left: "78%", width: "14%" }}
                />
                {/* indicators */}
                <div
                    style={{ top: "58.5%", left: "7.25%", width: "1.75%" }}
                    className={`
                    aspect-square
        absolute z-10 rounded-full pointer-events-none 
        animate-pulse
        shadow-[0_0_15px_rgba(255,0,0,0.6)]
        ${preview ? "bg-[radial-gradient(circle_at_30%_40%,#00ff00_20%,#008b00_90%)]" : "bg-[radial-gradient(circle_at_30%_40%,#ff0000_20%,#8b0000_90%)]"}
    `}
                />
                <div
                    style={{ top: "43.5%", left: "58.75%", width: "1.75%" }}
                    className={`
                    aspect-square
        absolute z-10 rounded-full pointer-events-none 
        animate-pulse
        shadow-[0_0_15px_rgba(255,0,0,0.6)]
        ${stone ? "bg-[radial-gradient(circle_at_30%_40%,#00ff00_20%,#008b00_90%)]" : "bg-[radial-gradient(circle_at_30%_40%,#ff0000_20%,#8b0000_90%)]"}
    `}
                />
                <div
                    style={{ top: "64.25%", left: "90.75%", width: "1.75%" }}
                    className={`
                    aspect-square
        absolute z-10 rounded-full pointer-events-none 
        animate-pulse
        shadow-[0_0_15px_rgba(255,0,0,0.6)]
        ${biome ? "bg-[radial-gradient(circle_at_30%_40%,#00ff00_20%,#008b00_90%)]" : "bg-[radial-gradient(circle_at_30%_40%,#ff0000_20%,#8b0000_90%)]"}
    `}
                />
                {/* buttons */}
                {/* amazonia */}
                <button
                    type="button"
                    onClick={() => {
                        audioRef.current.play();
                        setBiome("amazonia");
                    }}
                    aria-pressed={biome === "amazonia"}
                    className={`text-sm absolute cursor-pointer

${biome === "amazonia" ? "text-green-200" : ""}`}
                    style={{ top: "66.5%", left: "8%", width: "24%", height: "8%" }}
                >
                    amazonia
                </button>

                {/* plushland */}
                <button
                    type="button"
                    onClick={() => {
                        audioRef.current.play();
                        setBiome("plushland");
                    }}
                    aria-pressed={biome === "plushland"}
                    className={`text-sm absolute cursor-pointer

${biome === "plushland" ? "text-purple-200" : ""}`}
                    style={{ top: "66.5%", left: "36%", width: "24%", height: "8%" }}
                >
                    plushland
                </button>

                <button
                    type="button"
                    onClick={() => {
                        audioRef.current.play();
                        setBiome("coralux");
                    }}
                    aria-pressed={biome === "coralux"}
                    className={`text-sm absolute cursor-pointer

${biome === "coralux" ? "text-cyan-200" : ""}`}
                    style={{ top: "66.5%", left: "63%", width: "24%", height: "8%" }}
                >
                    coralux
                </button>

                <button
                    type="button"
                    className={`text-sm absolute text-gray-300 cursor-not-allowed`}
                    style={{ top: "77%", left: "8%", width: "24%", height: "8%" }}
                >
                    unknown
                </button>

                <button
                    type="button"
                    className={`text-sm absolute text-gray-300 cursor-not-allowed`}
                    style={{ top: "77%", left: "36%", width: "24%", height: "8%" }}
                >
                    unknown
                </button>

                <button
                    type="button"
                    className={`text-sm absolute text-gray-300 cursor-not-allowed`}
                    style={{ top: "77%", left: "63%", width: "24%", height: "8%" }}
                >
                    unknown
                </button>
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
                            <div className="bg-gray-900 border border-primary rounded-lg p-6 max-w-md w-full flex flex-col gap-5">
                                <h3 className="text-primary text-lg font-bold text-center">SELECT STONE</h3>

                                <div className="grid grid-cols-4 gap-3">
                                    {Object.entries(availableStones || []).map(([Type, SparkCount]) => {
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
                                                        : "hover:border-primary"
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

                                <hr className="w-full border-none h-0.5 bg-primary" />

                                <div className="grid grid-cols-4 gap-3">
                                    {purchases?.map(({ Id, Product }) => {
                                        return (
                                            <button
                                                key={Id}
                                                onClick={() => !isOpening && openPack(Id)}
                                                disabled={isOpening}
                                                className={`flex flex-col items-center rounded-lg transition-colors ${
                                                    isOpening
                                                        ? "opacity-50 cursor-not-allowed grayscale"
                                                        : "hover:border-primary"
                                                }`}
                                            >
                                                <div
                                                    className={`w-14 h-14 rounded-full mb-2 flex items-center justify-center ${
                                                        isOpening ? "bg-gray-800" : "bg-gray-700"
                                                    }`}
                                                >
                                                    <img src={PRODUCTS[Product]} alt="" />
                                                </div>

                                                <span className={`text-xs `}>{Id}</span>
                                            </button>
                                        );
                                    })}
                                </div>

                                <div className="flex gap-6">
                                    <Link
                                        className="w-1/2 text-center uppercase py-2 border border-primary text-primary rounded-lg hover:bg-primary/10 transition-colors"
                                        to="/storage"
                                    >
                                        storage
                                    </Link>

                                    <button
                                        onClick={() => setShowStoneDialog(false)}
                                        className="w-1/2 text-center uppercase py-2 border border-primary text-primary rounded-lg hover:bg-primary/10 transition-colors"
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
