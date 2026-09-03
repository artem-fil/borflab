import { useState } from "react";

export default function SlotsPanel({ slots, onSave, onActivate, onClear, onLoad }) {
    // slotN -> имя для инпута
    const [names, setNames] = useState({});
    const [busy, setBusy] = useState({});

    function getSlot(n) {
        return slots.find((s) => s.Slot === n) ?? null;
    }

    function setName(n, val) {
        setNames((prev) => ({ ...prev, [n]: val }));
    }

    async function doAction(n, fn) {
        setBusy((prev) => ({ ...prev, [n]: true }));
        try {
            await fn();
        } finally {
            setBusy((prev) => ({ ...prev, [n]: false }));
        }
    }

    return (
        <div className="bg-gray-900 rounded-lg p-3 flex flex-col gap-3">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Presets</h2>
            <div className="flex flex-col gap-2">
                {[1, 2, 3, 4, 5].map((n) => {
                    const slot = getSlot(n);
                    const name = names[n] ?? slot?.Name ?? "";
                    const isBusy = !!busy[n];

                    return (
                        <div key={n} className="flex flex-col items-start gap-2 bg-gray-800 rounded p-2">
                            <div className="flex gap-2 items-center">
                                <span className="text-xs text-gray-500 shrink-0 w-3">#{n}</span>

                                <input
                                    className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-gray-500"
                                    placeholder={slot ? slot.Name || "no name" : "slot name"}
                                    value={name}
                                    onChange={(e) => setName(n, e.target.value)}
                                />
                                {slot && (
                                    <span className="text-xs text-gray-600 shrink-0">
                                        {new Date(slot.Updated).toLocaleString("ru")}
                                    </span>
                                )}
                            </div>
                            <div className="flex gap-1 flex-wrap">
                                <button
                                    disabled={isBusy}
                                    onClick={() => doAction(n, () => onSave(n, name))}
                                    className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-50 transition-colors"
                                >
                                    save
                                </button>

                                {slot && (
                                    <>
                                        <button
                                            disabled={isBusy}
                                            onClick={() => doAction(n, () => onActivate(n))}
                                            className="text-xs px-2 py-1 rounded bg-blue-700 hover:bg-blue-600 disabled:opacity-50 transition-colors"
                                        >
                                            activate
                                        </button>

                                        <button
                                            disabled={isBusy}
                                            onClick={() => onLoad(slot.Payload)}
                                            className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-50 transition-colors"
                                        >
                                            edit
                                        </button>

                                        <button
                                            disabled={isBusy}
                                            onClick={() => doAction(n, () => onClear(n))}
                                            className="text-xs px-2 py-1 rounded bg-red-900 hover:bg-red-800 disabled:opacity-50 transition-colors"
                                        >
                                            clear
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
