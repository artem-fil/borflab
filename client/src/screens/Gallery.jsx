import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api.js";
import { BIOMES, RARITIES, STONES } from "../config.js";

const STONE_KEYS = Object.keys(STONES);
const BIOME_KEYS = Object.keys(BIOMES);
const QUALITY_KEYS = ["low", "medium", "high"];
const RARITY_KEYS = Object.keys(RARITIES);

function ToggleGroup({ label, options, active, setActive }) {
    const allOn = options.every((o) => active.includes(o));

    function toggle(o) {
        setActive((prev) => (prev.includes(o) ? prev.filter((x) => x !== o) : [...prev, o]));
    }

    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 uppercase tracking-wider">{label}</span>
                <div className="flex gap-2">
                    <button onClick={() => setActive([])} className="text-xs text-gray-600 hover:text-gray-400">
                        none
                    </button>
                    <button
                        onClick={() => setActive([...options])}
                        className="text-xs text-gray-600 hover:text-gray-400"
                    >
                        all
                    </button>
                </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
                {options.map((o) => (
                    <button
                        key={o}
                        onClick={() => toggle(o)}
                        className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                            active.includes(o)
                                ? "bg-gray-600 border-gray-500 text-gray-100"
                                : "border-gray-700 text-gray-600 hover:border-gray-500"
                        }`}
                    >
                        {o}
                    </button>
                ))}
            </div>
        </div>
    );
}

function ExperimentCard({ exp, selected, onToggle, onView }) {
    return (
        <div
            onClick={() => onView(exp)}
            className={`relative bg-gray-800 rounded-lg overflow-hidden border-2 transition-colors cursor-pointer group ${
                selected ? "border-blue-500" : "border-transparent hover:border-gray-600"
            }`}
        >
            {/* Кнопка / бейдж тогла выборки */}
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    onToggle(exp);
                }}
                className={`absolute top-1 right-1 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold z-10 transition-colors ${
                    selected
                        ? "bg-blue-500 text-white"
                        : "bg-gray-900/60 text-gray-400 hover:bg-gray-700 hover:text-white"
                }`}
            >
                ✓
            </button>

            {/* Картинка */}
            <div>
                {exp.ThumbUrl ? (
                    <img src={exp.ThumbUrl} alt={exp.Stone} className="w-full aspect-square object-cover" />
                ) : (
                    <div className="w-full aspect-square bg-gray-700 flex items-center justify-center text-gray-600 text-xs">
                        no image
                    </div>
                )}
            </div>

            {/* Текстовый блок */}
            <div className="p-1 flex flex-col gap-0.5">
                <div className="text-xs flex font-bold text-gray-200 truncate justify-between">
                    <span>{exp.Stone}</span>
                    <span className="text-gray-500">{exp.Biome}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-600">
                    <span>{exp.Quality ?? "—"}</span>
                    <span>{exp.Cost != null ? `$${Number(exp.Cost).toFixed(4)}` : "—"}</span>
                </div>
                <div className="text-xs text-gray-700">
                    {exp.Created ? new Date(exp.Created).toLocaleDateString("ru") : ""}
                </div>
            </div>
        </div>
    );
}

export function ComparisonView({ experiments, onClose }) {
    const isSingle = experiments.length === 1;

    return (
        <div className="fixed inset-0 bg-black/80 z-50 overflow-y-auto p-3 flex items-center justify-center">
            <div className={`w-full mx-auto ${isSingle ? "max-w-md" : "max-w-5xl"}`}>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-sm font-bold text-gray-300">
                        {isSingle ? "experiment details" : `comparison (${experiments.length})`}
                    </h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-sm cursor-pointer">
                        ✕ close
                    </button>
                </div>

                <div className={`grid gap-4 ${isSingle ? "grid-cols-1" : "grid-cols-2"}`}>
                    {experiments.map((exp) => (
                        <div
                            key={exp.Id}
                            className="bg-gray-900 rounded-lg overflow-hidden flex flex-col border border-gray-800"
                        >
                            {exp.ImageUrl ? (
                                <div className="relative">
                                    <img
                                        src={exp.ImageUrl}
                                        alt={exp.Stone}
                                        className="w-full aspect-square object-cover"
                                    />
                                    {exp.InputUrl && (
                                        <img
                                            src={exp.InputUrl}
                                            alt="input"
                                            className="absolute bottom-0 right-0 w-16 h-16 object-cover rounded border border-gray-700"
                                        />
                                    )}
                                </div>
                            ) : (
                                <div className="w-full aspect-square bg-gray-800 flex items-center justify-center text-gray-600 text-xs">
                                    no image
                                </div>
                            )}
                            <div className="p-3 flex flex-col gap-1.5">
                                <div className="flex justify-between text-xs">
                                    <span className="text-gray-300 font-bold">{exp.Stone}</span>
                                    <span className="text-gray-500">{exp.Biome}</span>
                                </div>
                                <div className="flex justify-between text-xs text-gray-500">
                                    <span>
                                        {exp.Quality ?? "—"} / {exp.Size ?? "—"}
                                    </span>
                                    <span>{exp.Cost != null ? `$${Number(exp.Cost).toFixed(4)}` : "—"}</span>
                                </div>
                                {exp.PromptAnalyzeUsed && (
                                    <details className="mt-1">
                                        <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-400">
                                            analyze
                                        </summary>
                                        <pre className="text-xs text-gray-500 whitespace-pre-wrap mt-1 bg-gray-800 p-2 rounded max-h-40 overflow-y-auto">
                                            {exp.PromptAnalyzeUsed}
                                        </pre>
                                    </details>
                                )}
                                {exp.PromptGenerationUsed && (
                                    <details>
                                        <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-400">
                                            generation
                                        </summary>
                                        <pre className="text-xs text-gray-500 whitespace-pre-wrap mt-1 bg-gray-800 p-2 rounded max-h-40 overflow-y-auto">
                                            {exp.PromptGenerationUsed}
                                        </pre>
                                    </details>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default function Gallery() {
    const navigate = useNavigate();

    // filters
    const [onlyTest, setOnlyTest] = useState(true);
    const [stones, setStones] = useState([...STONE_KEYS]);
    const [biomes, setBiomes] = useState([...BIOME_KEYS]);
    const [qualities, setQualities] = useState([...QUALITY_KEYS]);
    const [rarities, setRarities] = useState([...RARITY_KEYS]);

    // data
    const [experiments, setExperiments] = useState([]);
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);

    // selection
    const [selected, setSelected] = useState([]);
    const [comparing, setComparing] = useState(false);
    const [viewing, setViewing] = useState(null);

    const load = useCallback(
        async (p) => {
            setLoading(true);
            try {
                const data = await api.getExperiments(p, {
                    onlyTest,
                    stones: stones.length < STONE_KEYS.length ? stones : [],
                    biomes: biomes.length < BIOME_KEYS.length ? biomes : [],
                    qualities: qualities.length < QUALITY_KEYS.length ? qualities : [],
                    rarities: rarities.length < RARITY_KEYS.length ? rarities : [],
                });
                setExperiments(data.Experiments ?? []);
                setPages(data.Pages ?? 1);
                setTotal(data.Total ?? 0);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        },
        [onlyTest, stones, biomes, qualities, rarities]
    );

    // reload on filter change, reset page
    useEffect(() => {
        setPage(1);
        load(1);
    }, [onlyTest, stones, biomes, qualities, rarities]);

    useEffect(() => {
        load(page);
    }, [page]);

    function toggleSelect(exp) {
        setSelected((prev) => {
            const exists = prev.find((e) => e.Id === exp.Id);
            if (exists) return prev.filter((e) => e.Id !== exp.Id);
            if (prev.length >= 4) return prev;
            return [...prev, exp];
        });
    }

    return (
        <div className="min-h-screen bg-gray-950 text-gray-100">
            {/* header */}
            <div className="px-4 py-2 border-b border-gray-800 flex items-center">
                <h1 className="text-sm font-bold text-gray-400 tracking-widest shrink-0">BORFLAB DASHBOARD</h1>
                <nav className="flex-1 flex justify-center gap-1">
                    <button
                        onClick={() => navigate("/dashboard")}
                        className="text-xs px-3 py-1 rounded text-gray-500 hover:bg-gray-800 hover:text-gray-200 transition-colors"
                    >
                        playground
                    </button>
                    <span className="text-xs px-3 py-1 rounded bg-gray-800 text-gray-200 font-medium">gallery</span>
                </nav>
                <div className="shrink-0 w-32" />
            </div>

            <div className="flex h-[calc(100vh-49px)]">
                {/* filters sidebar */}
                <div className="w-56 shrink-0 border-r border-gray-800 overflow-y-auto p-3 flex flex-col gap-4">
                    {/* is_test toggle */}
                    <div className="flex flex-col gap-1.5">
                        <span className="text-xs text-gray-500 uppercase tracking-wider">Source</span>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={onlyTest}
                                onChange={(e) => setOnlyTest(e.target.checked)}
                                className="accent-blue-500"
                            />
                            <span className="text-xs text-gray-300">test only</span>
                        </label>
                    </div>

                    <ToggleGroup label="Stone" options={STONE_KEYS} active={stones} setActive={setStones} />
                    <ToggleGroup label="Biome" options={BIOME_KEYS} active={biomes} setActive={setBiomes} />
                    <ToggleGroup label="Quality" options={QUALITY_KEYS} active={qualities} setActive={setQualities} />
                    <ToggleGroup label="Rarity" options={RARITY_KEYS} active={rarities} setActive={setRarities} />
                </div>

                {/* main grid */}
                <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="text-xs text-gray-500">{loading ? "loading..." : `${total} results`}</span>
                        <div className="flex gap-2 items-center">
                            {selected.length >= 2 && (
                                <button
                                    onClick={() => setComparing(true)}
                                    className="text-xs px-3 py-1 bg-blue-700 hover:bg-blue-600 rounded transition-colors"
                                >
                                    compare ({selected.length})
                                </button>
                            )}
                            {selected.length > 0 && (
                                <button
                                    onClick={() => setSelected([])}
                                    className="text-xs text-gray-600 hover:text-gray-400"
                                >
                                    reset
                                </button>
                            )}
                            <button onClick={() => load(page)} className="text-xs text-gray-600 hover:text-gray-400">
                                refresh
                            </button>
                        </div>
                    </div>

                    {!loading && experiments.length === 0 ? (
                        <div className="text-xs text-gray-600 py-8 text-center">no results</div>
                    ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                            {experiments.map((exp) => (
                                <ExperimentCard
                                    key={exp.Id}
                                    exp={exp}
                                    selected={!!selected.find((e) => e.Id === exp.Id)}
                                    onToggle={toggleSelect}
                                    onView={setViewing}
                                />
                            ))}
                        </div>
                    )}

                    {pages > 1 && (
                        <div className="flex items-center justify-center gap-2 mt-2">
                            <button
                                disabled={page <= 1}
                                onClick={() => setPage((p) => p - 1)}
                                className="text-xs px-2 py-1 bg-gray-800 rounded disabled:opacity-40 hover:bg-gray-700"
                            >
                                ←
                            </button>
                            <span className="text-xs text-gray-500">
                                {page} / {pages}
                            </span>
                            <button
                                disabled={page >= pages}
                                onClick={() => setPage((p) => p + 1)}
                                className="text-xs px-2 py-1 bg-gray-800 rounded disabled:opacity-40 hover:bg-gray-700"
                            >
                                →
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {comparing && <ComparisonView experiments={selected} onClose={() => setComparing(false)} />}

            {viewing && <ComparisonView experiments={[viewing]} onClose={() => setViewing(null)} />}
        </div>
    );
}
