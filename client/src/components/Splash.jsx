import { useEffect, useRef, useState } from "react";

import logoImg from "@images/logo.png";
import secretariatImg from "@images/secretariat.png";

export default function Splash() {
    const [displayed, setDisplayed] = useState("");
    const monitorRef = useRef(null);

    const progressMessages = ["🔬 activating spiral index ", "🥬 confirming alignment ", "🐌 borfcore initiation "];

    async function appendTypedLineSequentially(line, isActive) {
        for (let i = 0; i < line.length; i++) {
            if (!isActive()) return;
            setDisplayed((prev) => prev + line[i]);
            await new Promise((r) => setTimeout(r, 25));
        }
        if (isActive()) setDisplayed((prev) => prev + "\n");
    }

    useEffect(() => {
        let active = true;
        async function runSequence() {
            setDisplayed("");

            for (const msg of progressMessages) {
                if (!active) break;
                await appendTypedLineSequentially(msg, () => active);
                if (active) {
                    await new Promise((r) => setTimeout(r, 300));
                }
            }
        }
        runSequence();
        return () => {
            active = false;
        };
    }, []);

    return (
        <div className="flex-grow flex flex-col items-center justify-center overflow-hidden p-4">
            <div
                className="relative flex items-center justify-center max-h-full w-full"
                style={{ aspectRatio: "0.55 / 1" }}
            >
                <div
                    style={{
                        width: "80%",
                        height: "60%",
                    }}
                    className="z-10 max-h-full w-full flex flex-col gap-4 items-center justify-center"
                >
                    <img src={logoImg} alt="logo" />
                    <div ref={monitorRef} className="text-primary w-full overflow-auto h-full">
                        <span className="uppercase whitespace-pre-wrap">{displayed}</span>
                        <span className="animate-pulse">▋</span>
                    </div>
                </div>

                <img
                    className="absolute inset-0 w-full max-h-auto object-contain"
                    src={secretariatImg}
                    alt="swapomat"
                />
            </div>
        </div>
    );
}
