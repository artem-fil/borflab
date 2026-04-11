import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import Button from "@components/Button";
import Stone from "@components/Stone";

import agateImage from "@images/agate.png";
import amazoniteImage from "@images/amazonite.png";
import jadeImage from "@images/jade.png";
import quartzImage from "@images/quartz.png";
import rubyImage from "@images/ruby.png";
import sapphireImage from "@images/sapphire.png";
import storageImage from "@images/storage.jpg";
import topazImage from "@images/topaz.png";

import api from "../api";

export default function Storage() {
    const navigate = useNavigate();
    const [sparkCount, setSparkCount] = useState(0);
    const [stoneDialog, setStoneDialog] = useState(false);
    const [availableStones, setAvailableStones] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadStonesData();
    }, []);

    async function loadStonesData() {
        setLoading(true);
        try {
            const { Stones } = await api.getStones();

            if (!Stones) {
                throw new Error("Laboratory data corruption: Stones not found in API response");
            }

            const totalSparks = Object.values(Stones).reduce((acc, count) => acc + count, 0);

            setSparkCount(totalSparks);
            setAvailableStones(Stones);
        } catch (error) {
            console.error("Error loading stones data:", error);
            setAvailableStones({});
            throw error;
        } finally {
            setLoading(false);
        }
    }

    const formatSparks = (type) => (loading ? "..." : (availableStones[type] || 0).toString().padStart(2, "0"));

    return (
        <div className="flex-grow flex flex-col items-center text-white py-2">
            <div className="w-full flex justify-between px-6 py-2">
                <div className="flex flex-col">
                    <h2 className=" font-bold text-xl">BORFstone storage</h2>
                    <span className="text-xs">AUTHORIZED ACCESS ONLY // DEPT. 006</span>
                </div>
            </div>
            <div className="w-full h-4 bg-gray-100 border-b-2 border-black shadow-md"></div>
            <div className="w-full flex-grow flex items-center justify-center">
                {stoneDialog ? (
                    <div className="flex relative items-center justify-center w-full h-full p-6">
                        <button className="absolute top-2 right-2" onClick={() => setStoneDialog(null)}>
                            ❌
                        </button>
                        <Stone type={stoneDialog} />
                    </div>
                ) : (
                    <div className="relative">
                        <img src={storageImage} alt="storage" className="w-full h-auto object-contain" />
                        <img
                            src={agateImage}
                            style={{
                                top: "35%",
                                left: "39.5%",
                                width: "20%",
                            }}
                            alt="agate"
                            className="absolute"
                            onClick={() => setStoneDialog("Agate")}
                        />
                        <div
                            className="flex flex-col gap-0.5 leading-none absolute text-xs text-primary"
                            style={{
                                top: "51%",
                                left: "39.5%",
                                width: "21%",
                            }}
                        >
                            <div>agate</div>
                            <div className="flex justify-between">
                                <div>sparks</div>
                                <div className="text-right">{formatSparks("Agate")}</div>
                            </div>
                        </div>
                        <img
                            src={jadeImage}
                            style={{
                                top: "21.5%",
                                left: "67%",
                                width: "20%",
                            }}
                            alt="jade"
                            className="absolute"
                            onClick={() => setStoneDialog("Jade")}
                        />
                        <div
                            className="flex flex-col gap-0.5 leading-none absolute text-xs text-primary"
                            style={{
                                top: "38%",
                                left: "66%",
                                width: "21%",
                            }}
                        >
                            <div>jade</div>
                            <div className="flex justify-between">
                                <div>sparks</div>
                                <div className="text-right">{formatSparks("Jade")}</div>
                            </div>
                        </div>
                        <img
                            src={topazImage}
                            alt="topaz"
                            style={{
                                top: "60%",
                                left: "39.5%",
                                width: "20%",
                            }}
                            className="absolute"
                            onClick={() => setStoneDialog("Topaz")}
                        />
                        <div
                            className="flex flex-col gap-0.5 leading-none absolute text-xs text-primary"
                            style={{
                                top: "75.7%",
                                left: "39.5%",
                                width: "21%",
                            }}
                        >
                            <div>topaz</div>
                            <div className="flex justify-between">
                                <div>sparks</div>
                                <div className="text-right">{formatSparks("Topaz")}</div>
                            </div>
                        </div>
                        <img
                            src={quartzImage}
                            style={{
                                top: "10.5%",
                                left: "11.5%",
                                width: "20%",
                            }}
                            alt="quartz"
                            className="absolute"
                            onClick={() => setStoneDialog("Quartz")}
                        />
                        <div
                            className="flex flex-col gap-0.5 leading-none absolute text-xs text-primary"
                            style={{
                                top: "26.7%",
                                left: "10.6%",
                                width: "21%",
                            }}
                        >
                            <div>quartz</div>
                            <div className="flex justify-between">
                                <div>sparks</div>
                                <div className="text-right">{formatSparks("Quartz")}</div>
                            </div>
                        </div>
                        <img
                            src={sapphireImage}
                            style={{
                                top: "59.5%",
                                left: "12%",
                                width: "20%",
                            }}
                            alt="sapphire"
                            className="absolute"
                            onClick={() => setStoneDialog("Sapphire")}
                        />
                        <div
                            className="flex flex-col gap-0.5 leading-none absolute text-xs text-primary"
                            style={{
                                top: "75.7%",
                                left: "10.6%",
                                width: "21%",
                            }}
                        >
                            <div>sapphire</div>
                            <div className="flex justify-between">
                                <div>sparks</div>
                                <div className="text-right">{formatSparks("Sapphire")}</div>
                            </div>
                        </div>
                        <img
                            src={amazoniteImage}
                            style={{
                                top: "10.5%",
                                left: "40%",
                                width: "20%",
                            }}
                            alt="amazonite"
                            className="absolute"
                            onClick={() => setStoneDialog("Amazonite")}
                        />
                        <div
                            className="flex flex-col gap-0.5 leading-none absolute text-xs text-primary"
                            style={{
                                top: "26.7%",
                                left: "39.5%",
                                width: "21%",
                            }}
                        >
                            <div>amazonite</div>
                            <div className="flex justify-between">
                                <div>sparks</div>
                                <div className="text-right">{formatSparks("Amazonite")}</div>
                            </div>
                        </div>
                        <img
                            src={rubyImage}
                            style={{
                                top: "35%",
                                left: "11.5%",
                                width: "20%",
                            }}
                            alt="ruby"
                            className="absolute"
                            onClick={() => setStoneDialog("Ruby")}
                        />
                        <div
                            className="flex flex-col gap-0.5 leading-none absolute text-xs text-primary"
                            style={{
                                top: "51%",
                                left: "10.6%",
                                width: "21%",
                            }}
                        >
                            <div>ruby</div>
                            <div className="flex justify-between">
                                <div>sparks</div>
                                <div className="text-right">{formatSparks("Ruby")}</div>
                            </div>
                        </div>
                        <div
                            className="uppercase leading-none absolute text-xs text-primary"
                            style={{
                                top: "86%",
                                left: "10.6%",
                            }}
                        >
                            {`>>spark energy stable...`}
                        </div>
                        <div
                            className="uppercase leading-none absolute text-xs text-cyan-500"
                            style={{
                                top: "46%",
                                left: "67%",
                            }}
                        >
                            {`${sparkCount} sparks`}
                        </div>
                    </div>
                )}
            </div>
            <div className="w-full h-4 bg-gray-100 shadow-md"></div>
            <div className="py-2">
                <Button onClick={() => navigate("/lab")} alt label={"go lab"} />
            </div>
        </div>
    );
}
