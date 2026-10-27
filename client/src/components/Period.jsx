import { dayKey, fmtPeriod, fmtValue } from "@components/LeaderboardUtils";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import api from "../api";

/**
 * «Зал славы»: чемпион каждой недели / месяца / года. Тап по карточке открывает полную таблицу периода.
 * onPick(day: "YYYY-MM-DD")
 */
export default function Period({ game, metric, period, selectedStart, onPick, onClose }) {
    const [year, setYear] = useState(selectedStart ? new Date(selectedStart).getUTCFullYear() : null);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let off = false;
        setLoading(true);
        setError(null);
        api.getLeaderboardHistory(game.Id, {
            period,
            metric,
            year: period === "year" ? undefined : (year ?? undefined),
        })
            .then((r) => !off && setData(r))
            .catch((e) => !off && setError(e.message))
            .finally(() => !off && setLoading(false));
        return () => {
            off = true;
        };
    }, [game.Id, period, metric, year]);

    const ordered = [game.Metrics.find((m) => m.Key === metric), ...game.Metrics.filter((m) => m.Key !== metric)];
    const [main, second] = ordered;
    const title = period === "year" ? "Hall of fame · years" : `Hall of fame · ${period}s`;
    const activeYear = data?.Year;

    return createPortal(
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center" onClick={onClose}>
            <div
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md max-h-[80%] flex flex-col bg-[#ddcfb7] border-2 border-black rounded-t-2xl shadow-lg"
            >
                <div className="flex items-center justify-between px-4 pt-3 pb-2">
                    <div className="flex flex-col leading-tight">
                        <strong className="uppercase text-sm font-bold">{title}</strong>
                        <span className="text-[10px] text-gray-700">Champion of each period · tap to open</span>
                    </div>
                    <button onClick={onClose} aria-label="close" className="text-xl leading-none px-2">
                        ✕
                    </button>
                </div>

                {period !== "year" && data?.Years?.length > 0 && (
                    <div className="flex gap-1 px-4 pb-2 overflow-x-auto">
                        {data.Years.map((y) => (
                            <button
                                key={y}
                                onClick={() => setYear(y)}
                                className={`px-3 py-1 rounded border-2 border-black text-xs font-bold ${
                                    y === activeYear ? "bg-black text-white" : "bg-white/60 text-black"
                                }`}
                            >
                                {y}
                            </button>
                        ))}
                    </div>
                )}

                <div
                    className="flex flex-col gap-1 px-4 pb-4 overflow-y-auto transition-opacity"
                    style={{ opacity: loading ? 0.5 : 1 }}
                >
                    {error && <div className="text-center text-sm py-4">Failed to load: {error}</div>}
                    {!error && data && data.Entries.length === 0 && (
                        <div className="text-center text-sm py-6 text-gray-700">No periods with runs yet.</div>
                    )}
                    {!data && !error && <div className="text-center text-sm py-6">...</div>}

                    {data?.Entries.map((e) => {
                        const w = e.Winner;
                        const live = new Date(e.End) > Date.now();
                        const selected = selectedStart && dayKey(selectedStart) === dayKey(e.Start);
                        return (
                            <button
                                key={e.Start}
                                onClick={() => onPick(dayKey(e.Start))}
                                className={`w-full text-left flex items-center gap-2 rounded border px-2 py-1 shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] ${
                                    selected ? "bg-emerald-200 border-emerald-700" : "bg-orange-50 border-black/60"
                                }`}
                            >
                                <div className="w-24 shrink-0 leading-tight">
                                    <div className="text-[11px] font-bold uppercase">
                                        {fmtPeriod(period, e.Start, e.End)}
                                    </div>
                                    <div className="text-[9px] text-gray-600">
                                        {live ? "live · " : ""}
                                        {e.Total} {e.Total === 1 ? "monster" : "monsters"}
                                    </div>
                                </div>
                                <span className="text-base shrink-0">👑</span>
                                {w.SpriteUrl ? (
                                    <img
                                        src={w.SpriteUrl}
                                        alt=""
                                        draggable={false}
                                        className="w-9 h-9 object-contain shrink-0"
                                    />
                                ) : (
                                    <div className="w-9 h-9 shrink-0" />
                                )}
                                <div className="flex-1 min-w-0 leading-tight">
                                    <div className="font-special uppercase text-sm truncate">{w.Name}</div>
                                    <div className="text-[9px] text-gray-600 font-mono truncate">{w.BorfId}</div>
                                </div>
                                <div className="text-right leading-tight shrink-0">
                                    <div className="font-bold text-base">{fmtValue(main, w.Metrics[main.Key])}</div>
                                    {second && (
                                        <div className="text-[10px] text-gray-600">
                                            {fmtValue(second, w.Metrics[second.Key])}
                                        </div>
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>,
        document.body
    );
}
