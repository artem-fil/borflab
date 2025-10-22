import { useState, useEffect, useRef } from "react";
import posterImg from "../assets/poster.png";
import analyzerImg from "../assets/analyzer.png";
import { useIdentityToken } from "@privy-io/react-auth";

export default function Step3({ next, specimen, biome, setAnalyzeResult }) {
    const { identityToken } = useIdentityToken();
    const [displayed, setDisplayed] = useState("");
    const [progress, setProgress] = useState(0);
    const typingRef = useRef(false);
    const monitorRef = useRef(null);
    const abortControllerRef = useRef(null);

    const isProd = !document.location.hostname.endsWith("localhost");
    const baseUrl = isProd ? "https://borflab.com/api" : "http://127.0.0.1:8282";

    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, []);

    useEffect(() => {
        const el = monitorRef.current;
        if (el) {
            el.scrollTop = el.scrollHeight;
        }
    }, [displayed]);

    useEffect(() => {
        if (!specimen || !biome) return;
        startAnalyze();
    }, [specimen, biome]);

    async function startAnalyze() {
        abortControllerRef.current = new AbortController();

        try {
            const formData = new FormData();
            formData.append("file", dataURLtoFile(specimen, "specimen.jpg"));
            formData.append("biome", biome);

            const response = await fetch(`${baseUrl}/analyze`, {
                method: "POST",
                body: formData,
                signal: abortControllerRef.current.signal,
                headers: {
                    Authorization: `Bearer ${identityToken}`,
                },
            });

            if (!response.ok) {
                let message;
                try {
                    const { error } = await response.json();
                    message = `${response.statusText}: ${error}`;
                } catch {
                    message = `Network error: ${response.statusText}`;
                }
                throw message;
            } else {
                const { Id } = await response.json();
                pollAnalyzeProgress(Id);
            }
        } catch (err) {
            await appendTypedLine(`  🔴 ${err}`);
            await appendTypedLine(" Please, try again.");
        }
    }

    async function pollAnalyzeProgress(analyzeTaskId) {
        const BASE_DELAY = 2000;
        let currentStep = 0;

        const timeout = setTimeout(() => {
            appendTypedLine(" ⏰ Analysis timeout: process terminated");
        }, 5 * 60 * 1000);

        async function poll() {
            try {
                const response = await fetch(`${baseUrl}/progress/${analyzeTaskId}`, {
                    signal: abortControllerRef.current.signal,
                });
                if (!response.ok) {
                    let message;
                    try {
                        const { error } = await response.json();
                        message = `${response.statusText}: ${error}`;
                    } catch {
                        message = `Network error: ${response.statusText}`;
                    }
                    throw message;
                } else {
                    const { progress, done, result, error } = await response.json();
                    setProgress(progress);
                    const step = Math.floor(progress / 10);
                    if (step > currentStep) {
                        for (; currentStep < step; currentStep++) {
                            await appendTypedLine(progressMessages[currentStep]);
                        }
                    }
                    if (done) {
                        clearTimeout(timeout);
                        setAnalyzeResult(result);
                        if (error) {
                            throw error;
                        } else {
                            await appendTypedLine(" Analysis complete!");
                            setTimeout(next, 1500);
                        }
                    } else {
                        setTimeout(poll, BASE_DELAY);
                    }
                }
            } catch (err) {
                clearTimeout(timeout);
                console.log(err);
                await appendTypedLine(`  🔴 ${err}`);
                await appendTypedLine(" Please, try again.");
            }
        }

        poll();
    }

    async function appendTypedLine(line = "") {
        if (!line) return Promise.resolve();

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
            }, 30);
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
                </div>
                {/* indicators */}
                <div
                    className={`absolute z-10 aspect-square rounded-full ${progress > 15 ? "bg-green-500/50" : ""}`}
                    style={{ top: "54.2%", left: "89.5%", width: "3%" }}
                />
                <div
                    className={`absolute z-10 aspect-square rounded-full ${progress > 30 ? "bg-green-500/50" : ""}`}
                    style={{ top: "47.8%", left: "89.5%", width: "3%" }}
                />
                <div
                    className={`absolute z-10 aspect-square rounded-full ${progress > 45 ? "bg-green-500/50" : ""}`}
                    style={{ top: "41.5%", left: "89.5%", width: "3%" }}
                />
                <div
                    className={`absolute z-10 aspect-square rounded-full ${progress > 60 ? "bg-green-500/50" : ""}`}
                    style={{ top: "35.1%", left: "89.5%", width: "3%" }}
                />
                <div
                    className={`absolute z-10 aspect-square rounded-full ${progress > 75 ? "bg-green-500/50" : ""}`}
                    style={{ top: "28.8%", left: "89.5%", width: "3%" }}
                />
                <div
                    className={`absolute z-10 aspect-square rounded-full ${progress > 90 ? "bg-green-500/50" : ""}`}
                    style={{ top: "22.5%", left: "89.5%", width: "3%" }}
                />
                <div
                    className={`absolute z-10 aspect-square rounded-full ${progress >= 100 ? "bg-green-500/50" : ""}`}
                    style={{ top: "16.1%", left: "89.5%", width: "3%" }}
                />
                <img src={analyzerImg} alt="analyzer" className="w-full h-auto object-contain" />
            </div>
        </div>
    );
}
