import secretariatImg from "@images/secretariat.png";
import { useEffect, useState } from "react";
import api from "../api";

export default function Counter() {
    const [loading, setLoading] = useState(true);
    const [counter, setCounter] = useState(null);

    useEffect(() => {
        loadCounterData();
    }, []);

    async function loadCounterData() {
        setLoading(true);
        try {
            const { ByBiome, ByRarity, ByStone } = await api.getCounter();

            setCounter({ ByBiome, ByRarity, ByStone });
        } catch (error) {
            console.error("Error loading counter data:", error);
            setCounter({});
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="flex-grow flex flex-col items-center justify-center overflow-hidden p-4">
            <div
                className="relative flex items-center justify-center max-h-full w-full"
                style={{ aspectRatio: "0.55 / 1" }}
            >
                <div
                    className="absolute overflow-y-auto z-10 text-primary text-xs"
                    style={{
                        top: "14%",
                        width: "80%",
                        height: "65%",
                    }}
                >
                    <h1 className="text-xl font-bold uppercase text-center">borf live counter</h1>
                    {loading ? (
                        "fetching..."
                    ) : (
                        <div className="flex flex-col gap-1">
                            <div className="flex justify-between items-center text-md">
                                <span className="uppercase">total:</span>
                                <span className="p-1 border border-primary rounded">000.000</span>
                            </div>
                            <h2 className="text-lg leading-tight font-bold uppercase text-center">--- by biome ---</h2>
                            {Object.entries(counter.ByBiome).map(([biome, number]) => (
                                <div className="flex justify-between items-center text-md">
                                    <span className="uppercase">{biome}:</span>
                                    <span className="p-1 border border-primary rounded">
                                        {String(number).padStart(6, "0")}
                                    </span>
                                </div>
                            ))}
                            <h2 className="text-lg leading-tight font-bold uppercase text-center">--- by rarity ---</h2>
                            {Object.entries(counter.ByRarity).map(([rarity, number]) => (
                                <div className="flex justify-between items-center text-md">
                                    <span className="uppercase">{rarity}:</span>
                                    <span className="p-1 border border-primary rounded">
                                        {String(number).padStart(6, "0")}
                                    </span>
                                </div>
                            ))}
                            <h2 className="text-lg leading-tight font-bold uppercase text-center">--- by stone ---</h2>
                            {Object.entries(counter.ByStone).map(([stone, number]) => (
                                <div className="flex justify-between items-center text-md">
                                    <span className="uppercase">{stone}:</span>
                                    <span className="p-1 border border-primary rounded">
                                        {String(number).padStart(6, "0")}
                                    </span>
                                </div>
                            ))}
                            <p>
                                Each number represents a confirmed BORFOLOGICAL TRANSMUTATION performed by the
                                collective of BORFOLOGISTS.
                            </p>
                            <p>[ Filed by Dept:014 // Statistical Oversight Confirmed ]</p>
                            <p>Spiral Index Reference: STAT-014-BORF</p>
                            <p>© 2026 BORFLAB. All enumeration rites reserved.</p>
                        </div>
                    )}
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
