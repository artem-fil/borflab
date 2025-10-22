import { useState, useEffect, useRef } from "react";
import posterImg from "../assets/poster.png";
import printerImg from "../assets/printer.png";
import cardbackImg from "../assets/card-back.png";
import cardfrontImg from "../assets/card-front.png";

export default function Step4({ analyzeResult, specimen, biome }) {
    const [done, setDone] = useState(false);
    const frontCardRef = useRef(null);
    const backCardRef = useRef(null);
    const printerIndicatorRef = useRef(null);
    const outputImageRef = useRef(null);

    useEffect(() => {
        if (!analyzeResult) return;
        startGenerate();
    }, [analyzeResult]);

    const isProd = !document.location.hostname.endsWith("localhost");
    const baseUrl = isProd ? "https://borflab.com/api" : "http://127.0.0.1:8282/api";

    async function startGenerate() {
        try {
            const resp = await fetch(`${baseUrl}/borf-generate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: analyzeResult["RENDER_DIRECTIVE"] }),
            });

            if (resp.ok) {
                const { Id } = await resp.json();
                pollGenerateProgress(Id);
            } else {
                const t = await resp.text();
                alert(t);
            }
        } catch (err) {
            console.error("Analyze error", err);
            alert("Network error starting analysis");
        }
    }

    async function pollGenerateProgress(generateTaskId) {
        let pollingCancelled = false;
        const timeout = setTimeout(() => {
            pollingCancelled = true;
            alert("⚠️ Analysis timeout. The creature refused to draw.");
        }, 3 * 60 * 1000);

        async function poll() {
            try {
                const res = await fetch(`${baseUrl}/borf-progress/${generateTaskId}`);
                if (!res.ok) throw new Error("Bad response");

                const { progress, done, result } = await res.json();

                if (backCardRef.current) {
                    backCardRef.current.style.bottom = `-${progress}%`;
                }

                setDone(done);

                if (done) {
                    clearTimeout(timeout);

                    if ("Error" in result) {
                        alert(result["Error"]);
                    } else {
                        let src = `data:image/png;base64,${result.data[0].b64_json}`;

                        if (frontCardRef.current) {
                            // плавно заезжает на место
                            frontCardRef.current.style.bottom = `0`;
                        }

                        if (printerIndicatorRef.current) {
                            printerIndicatorRef.current.style.animation = "none";
                        }
                        if (outputImageRef.current) {
                            outputImageRef.current.setAttribute("src", src);
                        }
                    }
                } else {
                    if (!pollingCancelled) {
                        setTimeout(poll, 1500);
                    }
                }
            } catch (err) {
                console.error("Polling error:", err);
                clearTimeout(timeout);
            }
        }

        poll();
    }

    return (
        <div className="flex flex-col h-full justify-end">
            <div className="flex-1 flex items-center justify-center overflow-hidden">
                <img src={posterImg} alt="poster" className="max-h-full max-w-full object-contain" />
            </div>

            <div className="relative w-full">
                {/* printer tray */}
                <div
                    className="absolute z-10 overflow-hidden"
                    style={{ bottom: "25%", left: "15%", width: "62%", aspectRatio: "0.62/1" }}
                >
                    {/* back card */}
                    <div
                        ref={backCardRef}
                        className="w-full absolute text-green-800 text-xs p-1 transition-all ease-out"
                        style={{
                            bottom: "0",
                            transitionDuration: "2000ms",
                            aspectRatio: "0.62 / 1",
                        }}
                    >
                        <img className="absolute inset-0 w-full h-full" src={cardbackImg} alt="card back" />
                        <div className="relative p-0.5 pb-5 rounded-xl w-full h-full">
                            <div className="relative flex flex-col border-4 rounded-xl w-full outline-4 outline-orange-100 h-full border-green-800 bg-orange-100">
                                <p className="p-1">S.I.N.: FLO-CON-00033850B</p>
                                <hr className="border-0 h-0.5 bg-green-800" />
                                <div className="pt-1 flex w-full">
                                    <div className="w-1/2 flex flex-col">
                                        <img
                                            src={specimen}
                                            className="ml-auto mr-auto rounded h-24 object-cover"
                                            alt="input image"
                                        />
                                        <strong className="bg-green-800 p-1 w-full uppercase text-gray-100">
                                            #GIR-003718
                                        </strong>
                                    </div>
                                    <div className="w-1/2 flex flex-col">
                                        <img className="ml-auto mr-auto h-24 object-cover" alt="borfstone" />
                                        <strong className="bg-green-800 p-1 w-full uppercase text-gray-100">
                                            borfstone
                                        </strong>
                                    </div>
                                </div>
                                <div className="p-1">
                                    <p>
                                        <strong className="font-bold uppercase">size:</strong>
                                        <span>{analyzeResult?.MONSTER_PROFILE?.size_tier}</span>
                                    </p>
                                    <p>
                                        <strong className="font-bold uppercase">rarity:</strong> epic
                                    </p>
                                    <p>
                                        <strong className="font-bold uppercase">movement:</strong>
                                        <span>{analyzeResult?.MONSTER_PROFILE?.movement_class}</span>
                                    </p>
                                    <p>
                                        <strong className="font-bold uppercase">limb_count:</strong>
                                        <span>{analyzeResult?.MONSTER_PROFILE?.limb_count}</span>
                                    </p>
                                </div>
                                <hr className="border-0 h-0.5 bg-green-800" />
                                <p className="p-1">
                                    <strong className="font-bold uppercase">personality:</strong>
                                    <span>{analyzeResult?.MONSTER_PROFILE?.personality}</span>
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* front card */}
                    <div
                        ref={frontCardRef}
                        className="w-full absolute text-green-800 text-xs p-1 transition-all ease-out"
                        style={{
                            bottom: "-100%",
                            transitionDuration: "2000ms",
                            aspectRatio: "0.62 / 1",
                        }}
                    >
                        <img className="absolute inset-0 w-full h-full" src={cardfrontImg} alt="card front" />
                        <div className="relative p-0.5 pb-5 w-full h-full">
                            <div className="flex flex-col w-full h-full rounded-xl border-4 border-green-800 bg-orange-100">
                                <h1 className="text-center uppercase font-bold text-lg">
                                    {analyzeResult?.MONSTER_PROFILE?.name}
                                </h1>
                                <hr className="border-0 h-0.5 bg-green-800" />
                                <p className="text-center">
                                    emergence tier: <strong className="font-bold">01</strong>
                                </p>
                                <div className="p-1 uppercase text-gray-100 bg-green-800">
                                    <span>
                                        biome: <strong className="font-bold">{biome}</strong>
                                    </span>
                                </div>
                                <div className="flex-grow flex overflow-hidden p-1">
                                    <img
                                        ref={outputImageRef}
                                        className="mr-auto ml-auto h-full object-cover"
                                        alt="output"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* indicator */}
                <div
                    ref={printerIndicatorRef}
                    className={`absolute z-10 aspect-square rounded-full ${done ? "" : "animate-pulse-button"}`}
                    style={{
                        top: "64.4%",
                        left: "87.8%",
                        width: "3%",
                    }}
                />
                <img src={printerImg} alt="igniter" className="w-full h-auto object-contain" />
            </div>
        </div>
    );
}
