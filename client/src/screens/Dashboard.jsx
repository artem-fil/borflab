import PromptEditor from "@components/PromptEditor.jsx";
import SelectorsPanel from "@components/SelectorsPanel.jsx";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api.js";
import { BIOMES, STONES } from "../config.js";

const STONE_KEYS = Object.keys(STONES);
const BIOME_KEYS = Object.keys(BIOMES);

function SlotManager({ slots = [], currentEditingIndex, onSelectSlot }) {
    const safeSlots = slots || [];
    const displaySlots = Array.from({ length: 5 }, (_, i) => safeSlots[i] || null);

    return (
        <div className="w-full flex flex-col gap-2 bg-gray-900 p-3 rounded-lg border border-gray-800 shrink-0">
            <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Slots</span>
            </div>

            <div className="flex flex-col gap-1.5">
                {displaySlots.map((slot, index) => {
                    const isSystemActive = index === 0;
                    const isSelected = index === currentEditingIndex;
                    const slotName = slot?.Name || slot?.name || `Slot ${index + 1}`;

                    return (
                        <div
                            key={index}
                            onClick={() => onSelectSlot(index)}
                            className={`flex items-center justify-between p-2.5 rounded border cursor-pointer transition-all ${
                                isSelected
                                    ? "bg-gray-800 border-blue-500"
                                    : "bg-gray-950 border-gray-800 hover:border-gray-700"
                            }`}
                        >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                {isSystemActive ? (
                                    <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                        ACTIVE
                                    </span>
                                ) : (
                                    <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded font-mono bg-gray-800 text-gray-500">
                                        #{index + 1}
                                    </span>
                                )}

                                <span
                                    className={`text-xs truncate font-medium ${
                                        isSelected ? "text-blue-400" : "text-gray-300"
                                    }`}
                                >
                                    {slotName}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default function Dashboard() {
    const [access, setAccess] = useState("loading");
    const [slots, setSlots] = useState([]);
    const navigate = useNavigate();

    // Состояние текущего редактируемого слота
    const [currentEditingIndex, setCurrentEditingIndex] = useState(0);
    const [slotName, setSlotName] = useState("");
    const [editedPrompt, setEditedPrompt] = useState(null);

    // Внешние фильтры
    const [stone, setStone] = useState(() => localStorage.getItem("db_stone") || STONE_KEYS[0]);
    const [biome, setBiome] = useState(() => localStorage.getItem("db_biome") || BIOME_KEYS[0]);
    const [quality, setQuality] = useState(() => localStorage.getItem("db_quality") || "medium");
    const [size, setSize] = useState(() => localStorage.getItem("db_size") || "1024x1024");
    const [photo, setPhoto] = useState(null);
    const [locked, setLocked] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem("db_locked") || "{}");
        } catch {
            return {};
        }
    });

    useEffect(() => {
        loadPrompts();
    }, []);

    useEffect(() => {
        localStorage.setItem("db_stone", stone);
    }, [stone]);
    useEffect(() => {
        localStorage.setItem("db_biome", biome);
    }, [biome]);
    useEffect(() => {
        localStorage.setItem("db_quality", quality);
    }, [quality]);
    useEffect(() => {
        localStorage.setItem("db_size", size);
    }, [size]);
    useEffect(() => {
        localStorage.setItem("db_locked", JSON.stringify(locked));
    }, [locked]);

    async function loadPrompts() {
        try {
            const data = await api.getPrompts();
            const rawPresets = data.Presets ?? [];

            const initialSlots = Array.from({ length: 5 }, (_, i) => {
                if (i === 0) {
                    return {
                        Slot: 0,
                        Name: data.Active?.Name,
                        Payload: data.Active?.Payload || null,
                    };
                }

                const preset = rawPresets.find((p) => p?.Slot === i) || rawPresets[i - 1] || null;

                return {
                    Slot: i,
                    Name: preset?.Name || `Slot ${i + 1}`,
                    Payload: preset?.Payload || null,
                };
            });

            setSlots(initialSlots);

            const activeSlot = initialSlots[0];
            setCurrentEditingIndex(0);
            setSlotName(activeSlot.Name);
            setEditedPrompt(activeSlot.Payload);

            setAccess("ok");
        } catch (err) {
            setAccess("forbidden");
            console.error(err);
        }
    }

    const handleSelectSlot = (index) => {
        setCurrentEditingIndex(index);
        const targetSlot = slots[index];

        setSlotName(targetSlot?.Name || targetSlot?.name || `Slot ${index + 1}`);

        const defaultPayload = {
            PromptAnalyze: {},
            PromptStone: {},
            PromptGeneration: {},
        };

        setEditedPrompt(targetSlot?.Payload || defaultPayload);
    };

    // Сохранение текущего слота
    const handleSaveCurrentSlot = async () => {
        const slotNum = currentEditingIndex;
        const nameToSave = slotName.trim() || `Slot ${slotNum + 1}`;
        const payloadToSave = editedPrompt;

        try {
            if (slotNum === 0) {
                await api.saveActivePrompt(nameToSave, payloadToSave);
            } else {
                // Передаем 3 аргумента ровно так, как ждет api.saveSlot(n, name, payload)
                await api.saveSlot(slotNum, nameToSave, payloadToSave);
            }

            // Локально обновляем стейт слотов
            setSlots((prev) =>
                prev.map((s, i) =>
                    i === slotNum ? { ...s, Name: nameToSave, name: nameToSave, Payload: payloadToSave } : s
                )
            );
        } catch (err) {
            console.error("Failed to save slot:", err);
        }
    };

    // Сделать выбранный слот активным
    const handleActivateCurrentSlot = async () => {
        await api.activateSlot(currentEditingIndex);
        await loadPrompts(); // Перезагружаем слоты с бэка
    };

    if (access === "loading") {
        return (
            <div className="flex items-center justify-center w-screen h-screen bg-gray-950 text-gray-500 text-sm">
                loading...
            </div>
        );
    }
    if (access === "forbidden") {
        return (
            <div className="flex items-center justify-center w-screen h-screen bg-gray-950 text-gray-500 text-sm">
                forbidden
            </div>
        );
    }

    const stoneInsert = editedPrompt?.PromptStone?.[stone]?.[biome] ?? "";
    const analyzeTemplate = editedPrompt?.PromptAnalyze?.[biome] ?? "";
    const generationPrompt = editedPrompt?.PromptGeneration?.[biome] ?? "";
    const mergedAnalyze = analyzeTemplate.includes("%s")
        ? analyzeTemplate.replace("%s", stoneInsert)
        : analyzeTemplate + "\n\n" + stoneInsert;

    return (
        <div className="min-h-screen bg-gray-950 text-gray-100">
            {/* Header */}
            <div className="px-4 py-2 border-b border-gray-800 flex items-center">
                <h1 className="text-sm font-bold text-gray-400 tracking-widest shrink-0">BORFLAB DASHBOARD</h1>
                <nav className="flex-1 flex justify-center gap-1">
                    <span className="text-xs px-3 py-1 rounded bg-gray-800 text-gray-200 font-medium">playground</span>
                    <button
                        onClick={() => navigate("/gallery")}
                        className="text-xs px-3 py-1 rounded text-gray-500 hover:bg-gray-800 hover:text-gray-200 transition-colors"
                    >
                        gallery
                    </button>
                </nav>
                <div className="shrink-0 w-32" />
            </div>

            <div className="flex h-[calc(100vh-49px)]">
                {/* col 1 — params + slot list */}
                <div className="w-80 shrink-0 border-r border-gray-800 overflow-y-auto">
                    <div className="p-3 flex flex-col gap-3">
                        <SelectorsPanel
                            stone={stone}
                            setStone={setStone}
                            biome={biome}
                            setBiome={setBiome}
                            quality={quality}
                            setQuality={setQuality}
                            size={size}
                            setSize={setSize}
                            photo={photo}
                            setPhoto={setPhoto}
                            locked={locked}
                            setLocked={setLocked}
                        />
                        <SlotManager
                            slots={slots}
                            currentEditingIndex={currentEditingIndex}
                            onSelectSlot={handleSelectSlot}
                        />
                    </div>
                </div>

                {/* col 2 — central prompt editor */}
                <div className="flex-1 flex flex-col overflow-y-auto border-r border-gray-800 p-3 gap-3">
                    {/* Твоя верхняя панель редактирования слота */}
                    <div className="flex items-center justify-between gap-3 bg-gray-900 p-2.5 rounded border border-gray-800">
                        <div className="flex items-center gap-2 flex-1">
                            <span className="text-xs font-mono text-gray-500 shrink-0">
                                Slot #{currentEditingIndex + 1}:
                            </span>
                            <input
                                type="text"
                                value={slotName}
                                onChange={(e) => setSlotName(e.target.value)}
                                placeholder="Slot name..."
                                className="bg-gray-950 text-xs text-gray-200 border border-gray-800 focus:border-blue-500 rounded px-2 py-1 flex-1 outline-none font-medium"
                            />
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            {currentEditingIndex !== 0 && (
                                <button
                                    onClick={handleActivateCurrentSlot}
                                    className="text-xs px-3 py-1 rounded bg-emerald-700 hover:bg-emerald-600 transition-colors font-medium text-white"
                                >
                                    Make Active
                                </button>
                            )}
                            <button
                                onClick={handleSaveCurrentSlot}
                                className="text-xs px-3 py-1 rounded bg-blue-700 hover:bg-blue-600 transition-colors font-medium text-white"
                            >
                                Save Changes
                            </button>
                        </div>
                    </div>

                    <div className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold">
                        Context: {stone} / {biome}
                    </div>

                    <PromptEditor prompt={editedPrompt} stone={stone} biome={biome} onChange={setEditedPrompt} />
                </div>

                {/* col 3 — final prompt readonly */}
                <div className="w-96 shrink-0 flex flex-col p-3 gap-2">
                    <span className="text-xs text-gray-500 uppercase tracking-wider">final prompt</span>
                    <textarea
                        readOnly
                        value={mergedAnalyze + "\n\n---\n\n" + generationPrompt}
                        className="flex-1 w-full bg-gray-900 border border-gray-800 rounded p-2 text-xs text-gray-400 font-mono resize-none focus:outline-none"
                    />
                </div>
            </div>
        </div>
    );
}
