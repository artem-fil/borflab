import monsterImg from "@images/monster.jpg";
import { useEffect, useRef, useState } from "react";
import api from "../api.js";
import { BIOMES, RARITIES, STONES } from "../config.js";

const STONE_KEYS = Object.keys(STONES);
const BIOME_KEYS = Object.keys(BIOMES);
const QUALITY_OPTIONS = ["low", "medium", "high"];
const SIZE_OPTIONS = ["1024x1024", "1536x1024", "1024x1536"];
const POLL_INTERVAL = 2000;

function LockToggle({ locked, onToggle }) {
    return (
        <button
            onClick={onToggle}
            className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                locked
                    ? "bg-yellow-500 border-yellow-500 text-black"
                    : "border-gray-600 text-gray-500 hover:border-gray-400"
            }`}
        >
            {locked ? "🔒" : "🔓"}
        </button>
    );
}

function Row({ label, locked, onToggleLock, children }) {
    return (
        <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-16 shrink-0">{label}</span>
            <div className="flex-1">{children}</div>
            <LockToggle locked={locked} onToggle={onToggleLock} />
        </div>
    );
}

function ResultModal({ result, stone, biome, quality, size, onClose }) {
    const p = result.specimen?.MONSTER_PROFILE ?? {};
    const rarity = result.specimen?.rarity ?? "";

    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-xl flex gap-5 p-5 max-w-3xl w-full max-h-[90vh]">
                {/* left — image */}
                <div className="w-96 shrink-0 flex flex-col gap-2">
                    {result.image && (
                        <img
                            src={result.image}
                            alt="monster"
                            className="w-full rounded-lg border border-gray-700 object-cover"
                        />
                    )}
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600 border-t border-gray-800 pt-2">
                        <span>
                            Stone: <span className="text-gray-400">{stone}</span>
                        </span>
                        <span>
                            Biome: <span className="text-gray-400">{biome}</span>
                        </span>
                        <span>
                            Quality: <span className="text-gray-400">{quality}</span>
                        </span>
                        <span>
                            Size: <span className="text-gray-400">{size}</span>
                        </span>
                        <span>
                            Exp: <span className="text-gray-400">#{result.experimentId}</span>
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-full py-2 bg-gray-800 hover:bg-gray-700 rounded text-sm transition-colors mt-1"
                    >
                        Close
                    </button>
                </div>

                {/* right — details */}
                <div className="flex-1 flex flex-col gap-3 overflow-y-auto">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-gray-200 uppercase tracking-wider">
                            {p.name || "Result"}
                            {rarity && (
                                <span
                                    style={{
                                        color: RARITIES[rarity.toLowerCase()],
                                    }}
                                    className="ml-2 text-gray-600 font-normal normal-case"
                                >
                                    · {rarity}
                                </span>
                            )}
                        </span>
                        <button onClick={onClose} className="text-gray-600 hover:text-gray-300 text-sm">
                            ✕
                        </button>
                    </div>

                    {p.species && <div className="text-xs text-gray-500 italic">{p.species}</div>}
                    {p.lore && <div className="text-sm text-gray-300">{p.lore}</div>}

                    <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs mt-1">
                        {p.habitat && (
                            <>
                                <span className="text-gray-600">Habitat</span>
                                <span className="text-gray-400">{p.habitat}</span>
                            </>
                        )}
                        {p.movement_class && (
                            <>
                                <span className="text-gray-600">Movement</span>
                                <span className="text-gray-400">{p.movement_class}</span>
                            </>
                        )}
                        {p.behaviour && (
                            <>
                                <span className="text-gray-600">Behaviour</span>
                                <span className="text-gray-400">{p.behaviour}</span>
                            </>
                        )}
                        {p.personality && (
                            <>
                                <span className="text-gray-600">Personality</span>
                                <span className="text-gray-400">{p.personality}</span>
                            </>
                        )}
                        {p.abilities && (
                            <>
                                <span className="text-gray-600">Abilities</span>
                                <span className="text-gray-400">{p.abilities}</span>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function SelectorsPanel({
    stone,
    setStone,
    biome,
    setBiome,
    quality,
    setQuality,
    size,
    setSize,
    photo,
    setPhoto,
    locked,
    setLocked,
}) {
    const fileInputRef = useRef(null);
    const pollRef = useRef(null);

    const [status, setStatus] = useState("idle"); // idle | generating | done | error
    const [progress, setProgress] = useState(0);
    const [statusText, setStatusText] = useState("");
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!photo) {
            fetch(monsterImg)
                .then((r) => r.blob())
                .then((blob) => {
                    const file = new File([blob], "test_photo.jpg", { type: "image/jpeg" });
                    setPhoto({ file, previewUrl: URL.createObjectURL(blob) });
                });
        }
        return () => clearInterval(pollRef.current);
    }, []);

    function toggleLock(key) {
        setLocked((prev) => ({ ...prev, [key]: !prev[key] }));
    }

    function handleFileChange(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        if (photo?.previewUrl) URL.revokeObjectURL(photo.previewUrl);
        setPhoto({ file, previewUrl: URL.createObjectURL(file) });
    }

    function stopPolling() {
        clearInterval(pollRef.current);
        pollRef.current = null;
    }

    function pollTask(taskId) {
        pollRef.current = setInterval(async () => {
            try {
                const data = await api.getTaskStatus(taskId);
                setProgress(data.progress ?? 0);
                setStatusText(data.stage ?? "");

                if (data.done) {
                    stopPolling();
                    if (data.nextTaskId) {
                        setResult((prev) => ({ ...prev, specimen: data.result }));
                        pollTask(data.nextTaskId);
                        return;
                    }
                    setStatus("done");

                    setResult((prev) => ({
                        ...prev,
                        image: data.result?.image,
                        experimentId: data.result?.experimentId,
                    }));
                }
                if (data.failed) {
                    stopPolling();
                    setStatus("error");
                    setError(data.error ?? "generation failed");
                }
            } catch (e) {
                stopPolling();
                setStatus("error");
                setError(e.message);
            }
        }, POLL_INTERVAL);
    }

    async function handleGenerate() {
        setStatus("generating");
        setProgress(0);
        setStatusText("");
        setResult(null);
        setError(null);

        try {
            const fd = new FormData();
            fd.append("file", photo.file);
            fd.append("stone", stone);
            fd.append("biome", biome);
            fd.append("quality", quality);
            fd.append("size", size);
            const { Id: taskId } = await api.generate(fd);
            pollTask(taskId);
        } catch (e) {
            setStatus("error");
            setError(e.message);
        }
    }

    const selectClass = "bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 w-full";

    return (
        <div className="bg-gray-900 rounded-lg p-3 flex flex-col gap-2">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Params</h2>

            <Row label="Stone" locked={locked.stone} onToggleLock={() => toggleLock("stone")}>
                <select
                    className={selectClass}
                    value={stone}
                    onChange={(e) => setStone(e.target.value)}
                    disabled={locked.stone}
                >
                    {STONE_KEYS.map((k) => (
                        <option key={k} value={k}>
                            {k}
                        </option>
                    ))}
                </select>
            </Row>

            <Row label="Biome" locked={locked.biome} onToggleLock={() => toggleLock("biome")}>
                <select
                    className={selectClass}
                    value={biome}
                    onChange={(e) => setBiome(e.target.value)}
                    disabled={locked.biome}
                >
                    {BIOME_KEYS.map((k) => (
                        <option key={k} value={k}>
                            {k}
                        </option>
                    ))}
                </select>
            </Row>

            <Row label="Quality" locked={locked.quality} onToggleLock={() => toggleLock("quality")}>
                <select
                    className={selectClass}
                    value={quality}
                    onChange={(e) => setQuality(e.target.value)}
                    disabled={locked.quality}
                >
                    {QUALITY_OPTIONS.map((q) => (
                        <option key={q} value={q}>
                            {q}
                        </option>
                    ))}
                </select>
            </Row>

            <Row label="Size" locked={locked.size} onToggleLock={() => toggleLock("size")}>
                <select
                    className={selectClass}
                    value={size}
                    onChange={(e) => setSize(e.target.value)}
                    disabled={locked.size}
                >
                    {SIZE_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                            {s}
                        </option>
                    ))}
                </select>
            </Row>

            <Row label="Image" locked={locked.photo} onToggleLock={() => toggleLock("photo")}>
                <div className="flex items-center gap-2">
                    <button
                        className="text-sm bg-gray-800 border border-gray-700 rounded px-3 py-1 hover:bg-gray-700 transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={locked.photo}
                    >
                        {photo ? "change" : "select"}
                    </button>
                    {photo && (
                        <img
                            src={photo.previewUrl}
                            alt=""
                            className="w-8 h-8 rounded object-cover border border-gray-700"
                        />
                    )}
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            </Row>

            {status === "idle" && (
                <button
                    onClick={handleGenerate}
                    disabled={!photo}
                    className="uppercase mt-1 px-4 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-40 rounded text-sm font-bold transition-colors"
                >
                    generate
                </button>
            )}

            {status === "generating" && (
                <div className="flex flex-col gap-1 mt-1">
                    <div className="w-full bg-gray-800 rounded-full h-1.5">
                        <div
                            className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <div className="flex justify-between text-xs text-gray-500">
                        <span>{statusText || "processing..."}</span>
                        <span>{progress}%</span>
                    </div>
                </div>
            )}

            {status === "error" && (
                <div className="flex flex-col gap-1 mt-1">
                    <div className="text-red-400 text-xs bg-red-950 rounded p-2">{error}</div>
                    <button onClick={() => setStatus("idle")} className="text-xs text-gray-600 hover:text-gray-300">
                        retry
                    </button>
                </div>
            )}

            {status === "done" && result && (
                <ResultModal
                    result={result}
                    stone={stone}
                    biome={biome}
                    quality={quality}
                    size={size}
                    onClose={() => setStatus("idle")}
                />
            )}
        </div>
    );
}
