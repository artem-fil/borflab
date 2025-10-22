import { useState } from "react";
import Step1 from "../components/Step1";
import Step2 from "../components/Step2";
import Step3 from "../components/Step3";
import Step4 from "../components/Step4";

export default function Lab() {
    const slides = [Step1, Step2, Step3, Step4];
    const [current, setCurrent] = useState(0);
    const [specimen, setSpecimen] = useState(null);
    const [biome, setBiome] = useState("");
    const [analyzeResult, setAnalyzeResult] = useState(null);

    const next = () => setCurrent((p) => (p + 1) % slides.length);

    return (
        <div className="flex-grow flex flex-col items-center overflow-hidden">
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
                            analyzeResult={analyzeResult}
                            setAnalyzeResult={setAnalyzeResult}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}
