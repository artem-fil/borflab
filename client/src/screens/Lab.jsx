import { useState, useCallback, useEffect, useRef } from "react";
import posterImg from "../assets/poster.png";
import igniterImg from "../assets/igniter.png";
import designatorImg from "../assets/designator.png";
import printerImg from "../assets/printer.png";
import analyzerImg from "../assets/analyzer.png";
import placeholderImg from "../assets/placeholder.svg";
import cardbackImg from "../assets/card-back.png";
import cardfromtImg from "../assets/card-front.png";

function Step1({ next, setSpecimen }) {
    const fileInputRef = useRef(null);
    const [preview, setPreview] = useState(null);
    const [displayed, setDisplayed] = useState("");
    const [index, setIndex] = useState(0);
    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = () => {
            setPreview(reader.result);
            setSpecimen(reader.result);
        };
        reader.readAsDataURL(file);
    };
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
                        <span className="text-sm">JPG, PNG, JPEG // 15 Mb max</span>
                    </div>
                )}
            </div>
            <div className="relative w-full">
                <img src={igniterImg} onClick={next} alt="igniter" className="w-full h-auto object-contain" />
                {/* submit */}
                <button
                    type="button"
                    onClick={() => preview && next()}
                    disabled={!preview}
                    aria-disabled={!preview}
                    className={`rounded-full aspect-square absolute
            ${preview ? "animate-pulse-ring " : " cursor-not-allowed"}`}
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
                        className="absolute inset-0 pointer-events-none"
                        style={{
                            background:
                                "linear-gradient(180deg, rgba(0,255,0,0) 0%, rgba(0,255,0,0.8) 50%, rgba(0,255,0,0) 100%)",
                            backgroundRepeat: "no-repeat",
                            backgroundSize: "100% 8%",
                            animation: "scan 2.5s linear infinite",
                            mixBlendMode: "screen",
                            opacity: 0.7,
                        }}
                    />
                    <p>BORFLAB 37.987-B</p>
                    <span className="whitespace-pre-wrap leading-tight">{displayed}</span>
                    <span className="animate-pulse">▋</span>
                    <style jsx>{`
                        @keyframes scan {
                            0% {
                                background-position: 0 -100%;
                            }
                            100% {
                                background-position: 0 100%;
                            }
                        }
                    `}</style>
                </div>
            </div>
        </div>
    );
}
function Step2({ next, biome, setBiome }) {
    const toggle = useCallback((b) => setBiome((prev) => (prev === b ? null : b)), [setBiome]);

    const canSubmit = !!biome;

    return (
        <div className="flex flex-col h-full justify-end">
            <div className="flex-1 flex items-center justify-center overflow-hidden">
                <img src={posterImg} alt="poster" className="max-h-full max-w-full object-contain" />
            </div>

            <div className="relative w-full">
                {/* amazonia */}
                <button
                    type="button"
                    onClick={() => toggle("amazonia")}
                    aria-pressed={biome === "amazonia"}
                    className={`rounded-sm absolute cursor-pointer
            ${biome === "amazonia" ? "ring-2 ring-green-500 ring-offset ring-offset-black/40" : ""}`}
                    style={{ top: "17%", left: "13%", width: "21%", height: "12%" }}
                />

                {/* plushland */}
                <button
                    type="button"
                    onClick={() => toggle("plushland")}
                    aria-pressed={biome === "plushland"}
                    className={`rounded-sm absolute cursor-pointer
            ${biome === "plushland" ? "ring-2 ring-purple-500 ring-offset ring-offset-black/40" : ""}`}
                    style={{ top: "34%", left: "13%", width: "21%", height: "12%" }}
                />

                {/* submit */}
                <button
                    type="button"
                    onClick={() => canSubmit && next()}
                    disabled={!canSubmit}
                    aria-disabled={!canSubmit}
                    className={`rounded-full aspect-square absolute
            ${canSubmit ? "animate-pulse-ring" : " cursor-not-allowed"}`}
                    style={{ top: "53%", left: "78%", width: "12%" }}
                />

                <img
                    src={designatorImg}
                    alt="designator"
                    className="w-full h-auto object-contain pointer-events-none select-none z-0"
                />
                <style jsx>{`
                    @keyframes pulse-ring {
                        0% {
                            box-shadow: 0 0 2px 1px rgba(255, 165, 0, 0.6);
                        }
                        25% {
                            box-shadow: 0 0 2px 3px rgba(255, 165, 0, 0.6);
                        }
                        50% {
                            box-shadow: 0 0 2px 6px rgba(255, 165, 0, 0.6);
                        }
                        75% {
                            box-shadow: 0 0 2px 3px rgba(255, 165, 0, 0.6);
                        }
                        100% {
                            box-shadow: 0 0 2px 1px rgba(255, 165, 0, 0.6);
                        }
                    }

                    .animate-pulse-ring {
                        animation: pulse-ring 1s ease-in-out infinite;
                    }
                `}</style>
            </div>
        </div>
    );
}
function Step3({ next, specimen, biome }) {
    const [displayed, setDisplayed] = useState("");
    const [analyzing, setAnalyzing] = useState(false);
    const [progress, setProgress] = useState(0);
    const typingRef = useRef(false);
    const monitorRef = useRef(null);
    useEffect(() => {
        const el = monitorRef.current;
        if (el) {
            el.scrollTop = el.scrollHeight;
        }
    }, [displayed]);

    const isProd = !document.location.hostname.endsWith("localhost");
    const baseUrl = isProd ? "https://writewithdot.com/api" : "http://127.0.0.1:8181/api";

    useEffect(() => {
        if (!specimen || !biome) return;

        startAnalyze();
    }, [specimen, biome]);

    async function startAnalyze() {
        try {
            setAnalyzing(true);
            const formData = new FormData();
            formData.append("file", dataURLtoFile(specimen, "specimen.jpg"));
            formData.append("biome", biome);

            const resp = await fetch(`${baseUrl}/borf-analyze`, {
                method: "POST",
                body: formData,
            });

            if (!resp.ok) {
                const t = await resp.text();
                alert(t);
                setAnalyzing(false);
                return;
            }

            const { Id } = await resp.json();
            pollAnalyzeProgress(Id);
        } catch (err) {
            console.error("Analyze error", err);
            alert("Network error starting analysis");
            setAnalyzing(false);
        }
    }

    async function pollAnalyzeProgress(analyzeTaskId) {
        const timeout = setTimeout(() => {
            setDisplayed((p) => p + "\n⚠️ Analysis timeout. The creature refused to cooperate.");
            setAnalyzing(false);
        }, 3 * 60 * 1000);

        let currentStep = 0;

        async function poll() {
            try {
                const res = await fetch(`${baseUrl}/borf-progress/${analyzeTaskId}`);
                if (!res.ok) throw new Error("Bad response");

                const { progress, done, result } = await res.json();
                setProgress(progress);

                const x = Math.floor(progress / 10);
                if (x > currentStep) {
                    for (; currentStep < x; currentStep++) {
                        await appendTypedLine(progressMessages[currentStep]);
                    }
                }

                if (done) {
                    clearTimeout(timeout);
                    await appendTypedLine(" Analysis complete.");
                    setAnalyzing(false);
                    setTimeout(next, 1000);
                } else {
                    setTimeout(poll, 1500);
                }
            } catch (err) {
                console.error("Polling error:", err);
                clearTimeout(timeout);
                setAnalyzing(false);
                await appendTypedLine("⚠️ Connection lost. Analysis aborted.");
            }
        }

        poll();
    }

    async function appendTypedLine(line = "") {
        typingRef.current = true;
        return new Promise((resolve) => {
            let i = 0;
            const interval = setInterval(() => {
                setDisplayed((prev) => prev + line.charAt(i));
                i++;
                if (i >= line.length) {
                    clearInterval(interval);
                    setDisplayed((prev) => prev + "\n");
                    typingRef.current = false;
                    resolve();
                }
            }, 40);
        });
    }

    function dataURLtoFile(dataurl, filename) {
        const arr = dataurl.split(",");
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) u8arr[n] = bstr.charCodeAt(n);
        return new File([u8arr], filename, { type: mime });
    }

    const progressMessages = [
        " 🔬 Adding quantum stabilizer ✅",
        " 🥬 Throwing in the bio-gel ✅",
        " 💨 Adjusting carbon regulators ✅",
        " 🐌 Feeding Ted to specimen ✅",
        " 🧪 Mixing neural reagents ✅",
        " ⚙️ Calibrating flux capacitors ✅",
        " 🧠 Stabilizing entropy field ✅",
        " ✨ Finalizing data output ✅",
    ];

    return (
        <div className="flex flex-col h-full justify-end">
            <div className="flex-1 flex items-center justify-center overflow-hidden">
                <img src={posterImg} alt="poster" className="max-h-full max-w-full object-contain" />
            </div>

            <div className="relative w-full">
                {/* monitor */}
                <div
                    ref={monitorRef}
                    className="absolute text-xs text-lime-500 overflow-auto font-[monospace,emoji] leading-tight"
                    style={{
                        top: "18%",
                        left: "13%",
                        width: "66%",
                        aspectRatio: "1 / 0.6",
                    }}
                >
                    <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                            background:
                                "linear-gradient(180deg, rgba(0,255,0,0) 0%, rgba(0,255,0,0.8) 50%, rgba(0,255,0,0) 100%)",
                            backgroundRepeat: "no-repeat",
                            backgroundSize: "100% 6%",
                            animation: "scan 2.5s linear infinite",
                            mixBlendMode: "screen",
                            opacity: 0.7,
                        }}
                    />
                    <p>BORFLAB 37.987-B</p>
                    <p>Progress... {progress}%</p>
                    <span className="whitespace-pre-wrap">{displayed}</span>
                    <span className="animate-pulse">▋</span>
                    <style jsx>{`
                        @keyframes scan {
                            0% {
                                background-position: 0 -100%;
                            }
                            100% {
                                background-position: 0 150%;
                            }
                        }
                    `}</style>
                </div>

                {/* analyzer image */}
                <img src={analyzerImg} alt="analyzer" className={`w-full h-auto object-contain`} />
            </div>
        </div>
    );
}

function Step4() {
    return (
        <div className="flex flex-col h-full justify-end ">
            <div className="flex-1 flex items-center justify-center overflow-hidden">
                <img src={posterImg} alt="poster" className="max-h-full max-w-full object-contain" />
            </div>
            <div className="relative w-full">
                <div className="absolute z-10" style={{ top: "75%", left: "15%", width: "62%", height: "0" }}>
                    <div
                        style={{
                            bottom: "100%",
                            aspectRatio: "0.62 / 1",
                        }}
                        className="w-full absolute text-green-800 text-xs p-1 bottom: -100%; transition: all 2s ease-out;"
                    >
                        <img className="absolute inset-0 w-full h-full" src={cardbackImg} alt="card back" />
                        <div className="relative p-0.5 pb-5 rounded-2xl w-full h-full ">
                            <div className="relative flex flex-col border-4 rounded-xl w-full h-full border-green-800 bg-orange-100">
                                <p className="p-1">S.I.N.: FLO-CON-00033850B</p>
                                <hr className="border-0 h-0.5 bg-green-800" />
                                <div className="pt-1 flex w-full">
                                    <div className="w-1/2 flex flex-col">
                                        <img className="ml-auto mr-auto rounded h-24 object-cover" alt="" />
                                        <strong className="bg-green-800 p-1 w-full uppercase text-gray-100">
                                            #GIR-003718
                                        </strong>
                                    </div>
                                    <div className=" w-1/2 flex flex-col">
                                        <img className="ml-auto mr-auto h-24 object-cover" src="images/s6/stone.png" />
                                        <strong className="bg-green-800 p-1 w-full uppercase text-gray-100">
                                            borfstone
                                        </strong>
                                    </div>
                                </div>
                                <div className="p-1">
                                    <p>
                                        <strong className="font-bold uppercase">size:</strong>
                                        <span>medium</span>
                                    </p>
                                    <p>
                                        <strong className="font-bold uppercase">rarity:</strong>epic
                                    </p>
                                    <p>
                                        <strong className="font-bold uppercase">movement:</strong>
                                        <span>gliding</span>
                                    </p>
                                    <p>
                                        <strong className="font-bold uppercase">limb_count:</strong>
                                        <span>4</span>
                                    </p>
                                </div>
                                <hr className="border-0 h-0.5 bg-green-800" />
                                <p className="p-1">
                                    <strong className="font-bold uppercase">personality:</strong>
                                    <span></span>
                                </p>
                            </div>
                        </div>
                    </div>
                    <div></div>
                </div>
                <img src={printerImg} alt="igniter" className="w-full h-auto object-contain" />
            </div>
        </div>
    );
}

export default function Lab() {
    const slides = [Step1, Step2, Step3, Step4];
    const [current, setCurrent] = useState(0);
    const [specimen, setSpecimen] = useState(null);
    const [biome, setBiome] = useState("");

    const next = () => setCurrent((p) => (p + 1) % slides.length);

    return (
        <div className="flex-grow  flex flex-col items-center overflow-hidden">
            <div
                className="flex transition-transform duration-500 ease-in-out w-full h-full"
                style={{
                    transform: `translateX(-${current * 100}%)`,
                }}
            >
                {slides.map((Slide, i) => (
                    <div key={i} className="min-w-full h-full flex items-center justify-center">
                        <Slide
                            next={next}
                            specimen={specimen}
                            setSpecimen={setSpecimen}
                            biome={biome}
                            setBiome={setBiome}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}
