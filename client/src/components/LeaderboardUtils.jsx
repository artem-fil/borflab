import { useEffect, useState } from "react";
import api from "../api";

export const PERIODS = [
    { id: "week", label: "week" },
    { id: "month", label: "month" },
    { id: "year", label: "year" },
    { id: "all", label: "all" },
];

export function fmtValue(def, v) {
    if (v == null) return "–";
    if (def?.Unit === "seconds") {
        const s = Math.floor(v);
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    }
    return Number(v).toLocaleString("en-US");
}

const fmt = (o) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...o });

/** Подпись периода. end — исключительная граница (как отдаёт сервер). Всё в UTC. */
export function fmtPeriod(period, start, end) {
    if (period === "all") return "All time";
    const s = new Date(start);
    const e = new Date(new Date(end) - 1);
    if (period === "year") return String(s.getUTCFullYear());
    if (period === "month") return fmt({ month: "long", year: "numeric" }).format(s);
    const a = fmt({ month: "short", day: "numeric" }).format(s);
    const b = fmt(s.getUTCMonth() === e.getUTCMonth() ? { day: "numeric" } : { month: "short", day: "numeric" }).format(
        e
    );
    return `${a} – ${b}, ${e.getUTCFullYear()}`;
}

export const dayKey = (d) => new Date(d).toISOString().slice(0, 10);
export const dayBefore = (d) => dayKey(new Date(d).getTime() - 86400000);

/** Реестр игр с сервера (кешируется на уровне модуля) */
let gamesPromise = null;
export function useGames() {
    const [state, setState] = useState({ games: null, error: null });
    useEffect(() => {
        let off = false;
        gamesPromise ??= api.getGames().catch((e) => {
            gamesPromise = null;
            throw e;
        });
        gamesPromise
            .then((r) => !off && setState({ games: r.Games, error: null }))
            .catch((e) => !off && setState({ games: null, error: e.message }));
        return () => {
            off = true;
        };
    }, []);
    return state;
}
