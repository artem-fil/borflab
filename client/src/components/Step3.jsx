import { useState, useEffect, useRef } from "react";
import poster3Img from "@images/poster03.png";
import analyzerImg from "@images/analyzer.png";
import labSound from "@sounds/lab.ogg";
import api from "../api";

export default function Step3({ next, specimen, stone, biome, setAnalyzeResult, setNextTask }) {
    const [displayed, setDisplayed] = useState("");
    const [progress, setProgress] = useState(0);
    const typingRef = useRef(false);
    const monitorRef = useRef(null);
    const sseRef = useRef(null);
    const queueRef = useRef(Promise.resolve());
    const audioRef = useRef(new Audio(labSound));
    audioRef.current.volume = 0.5;

    useEffect(() => {
        if (!specimen || !biome || !stone) return;
        startAnalyze();
    }, [specimen, biome, stone]);

    useEffect(() => {
        const el = monitorRef.current;
        if (el) {
            el.scrollTop = el.scrollHeight;
        }
    }, [displayed]);

    async function startAnalyze() {
        audioRef.current.play();
        try {
            const formData = new FormData();
            formData.append("file", specimen, "specimen.jpg");
            formData.append("biome", biome);
            formData.append("stone", stone.Type);

            const { Id } = await api.analyze(formData);

            subscribeAnalyzeProgress(Id);
        } catch (err) {
            await appendTypedLine(`❌ ${err.message || err}`);
            await appendTypedLine("Please, try again.");
        }
    }

    function subscribeAnalyzeProgress(analyzeTaskId) {
        const TIMEOUT_MS = 3 * 60 * 1000;
        // localStep — это наш синхронный счетчик, чтобы не было дублей
        let localStep = 0;
        let timeout = null;

        const clearAll = () => {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            if (timeout) {
                clearTimeout(timeout);
                timeout = null;
            }
            sseRef.current?.close();
            sseRef.current = null;
        };

        timeout = setTimeout(async () => {
            clearAll();
            await appendTypedLine("⚠️ Analysis timeout: process terminated");
        }, TIMEOUT_MS);

        sseRef.current = api.subscribeSSE(analyzeTaskId, {
            onEvent: (event, data) => {
                // Убираем async здесь, нам важна синхронная обработка шагов
                if (event === "progress") {
                    const { progress } = data;
                    setProgress(progress);

                    const targetStep = Math.floor(progress / 10);

                    // СИНХРОННО закидываем сообщения в очередь, пока не дойдем до нужного шага
                    while (localStep < targetStep && localStep < progressMessages.length) {
                        const msg = progressMessages[localStep];

                        // Мы не ждем здесь через await!
                        // appendTypedLine сам ставит сообщения в очередь через queueRef.current
                        appendTypedLine(msg);

                        // Инкремент происходит МГНОВЕННО.
                        // Если через 1мс прилетит новый эвент, localStep уже будет новым.
                        localStep++;
                    }
                }

                if (event === "done") {
                    setProgress(100);
                    clearAll();

                    const { result, nextTask } = data;
                    setAnalyzeResult(result);
                    setNextTask(nextTask);

                    appendTypedLine("Analysis complete!");

                    // Ждем окончания печати всей очереди, прежде чем идти дальше
                    queueRef.current.then(() => {
                        setTimeout(next, 1500);
                    });
                }

                if (event === "failed") {
                    setProgress(100);
                    clearAll();
                    const { error } = data;
                    appendTypedLine(`❌ ${error}`);
                }
            },

            onError: (err) => {
                clearAll();
                console.error(err);
                appendTypedLine(`❌ Cannot subscribe SSE`);
                appendTypedLine("Please, try again.");
            },
        });
    }

    async function appendTypedLine(line = "") {
        if (!line) return;

        // Цепляемся к хвосту очереди
        queueRef.current = queueRef.current.then(async () => {
            typingRef.current = true;

            // Печатаем строку посимвольно
            for (let i = 0; i < line.length; i++) {
                setDisplayed((prev) => prev + line[i]);
                await new Promise((r) => setTimeout(r, 30));
            }

            // Добавляем перенос строки в конце
            setDisplayed((prev) => prev + "\n");
            typingRef.current = false;
        });

        return queueRef.current;
    }

    const progressMessages = [
        "🔬 Adding quantum stabilizer ✅",
        "🥬 Throwing in the bio-gel ✅",
        "💨 Adjusting carbon regulators ✅",
        "🐌 Feeding Ted to specimen ✅",
        "🧪 Mixing neural reagents ✅",
        "⚙️ Calibrating flux capacitors ✅",
        "🧠 Stabilizing entropy field ✅",
        "✨ Finalizing data output ✅",
    ];

    return (
        <div className="flex flex-col h-full justify-end">
            <div className="flex-1 flex items-center justify-center overflow-hidden">
                <img src={poster3Img} alt="poster" className="max-h-full max-w-full object-contain" />
            </div>

            <div className="relative w-full">
                {/* monitor */}
                <div
                    className="absolute text-xs text-lime-500 font-[monospace,emoji] leading-tight"
                    style={{
                        top: "16%",
                        left: "12%",
                        width: "67%",
                        aspectRatio: "1 / 0.8",
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
                    <div ref={monitorRef} className="overflow-auto h-full">
                        <p>BORFLAB 37.987-B</p>
                        <p>Progress... {progress}%</p>
                        <span className="whitespace-pre-wrap">{displayed}</span>
                        <span className="animate-pulse">▋</span>
                    </div>
                </div>
                {/* indicators */}
                <div
                    className={`absolute z-10 aspect-square rounded-full ${progress > 10 ? "bg-green-500/50" : ""}`}
                    style={{ top: "61.3%", left: "89.5%", width: "3%" }}
                />
                <div
                    className={`absolute z-10 aspect-square rounded-full ${progress > 20 ? "bg-green-500/50" : ""}`}
                    style={{ top: "56.1%", left: "89.5%", width: "3%" }}
                />
                <div
                    className={`absolute z-10 aspect-square rounded-full ${progress > 30 ? "bg-green-500/50" : ""}`}
                    style={{ top: "50.5%", left: "89.5%", width: "3%" }}
                />
                <div
                    className={`absolute z-10 aspect-square rounded-full ${progress > 40 ? "bg-green-500/50" : ""}`}
                    style={{ top: "45.3%", left: "89.5%", width: "3%" }}
                />
                <div
                    className={`absolute z-10 aspect-square rounded-full ${progress > 50 ? "bg-green-500/50" : ""}`}
                    style={{ top: "40.5%", left: "89.5%", width: "3%" }}
                />
                <div
                    className={`absolute z-10 aspect-square rounded-full ${progress > 60 ? "bg-green-500/50" : ""}`}
                    style={{ top: "35.1%", left: "89.5%", width: "3%" }}
                />
                <div
                    className={`absolute z-10 aspect-square rounded-full ${progress > 70 ? "bg-green-500/50" : ""}`}
                    style={{ top: "29.5%", left: "89.5%", width: "3%" }}
                />
                <div
                    className={`absolute z-10 aspect-square rounded-full ${progress > 80 ? "bg-green-500/50" : ""}`}
                    style={{ top: "24.2%", left: "89.5%", width: "3%" }}
                />
                <div
                    className={`absolute z-10 aspect-square rounded-full ${progress >= 100 ? "bg-green-500/50" : ""}`}
                    style={{ top: "19%", left: "89.5%", width: "3%" }}
                />
                <img src={analyzerImg} alt="analyzer" className="w-full h-auto object-contain" />
            </div>
        </div>
    );
}
