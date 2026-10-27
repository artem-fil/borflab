import { PERIODS, dayBefore, dayKey, fmtPeriod, fmtValue, useGames } from "@components/LeaderboardUtils";
import { useEffect, useState } from "react";
import api from "../api";
import Period from "./Period";

// ЗАМЕНЯЕТ LeaderboardTable.jsx целиком. Default-экспорт переименован: Leaderboard → LeaderboardTable.

const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const G = { green: "#3df0a0", dim: "#2fbf84", line: "rgba(61,240,160,0.35)", mine: "rgba(61,240,160,0.18)" };
const MEDALS = { 1: "🥇", 2: "🥈", 3: "🥉" };

function fmtLeft(iso) {
    if (!iso) return "";
    const ms = new Date(iso) - Date.now();
    if (ms <= 0) return "";
    const m = Math.floor(ms / 60000);
    const d = Math.floor(m / 1440);
    const h = Math.floor((m % 1440) / 60);
    return d > 0 ? `${d}d ${h}h` : `${h}h ${m % 60}m`;
}

function useLeaderboard({ gameId, period, metric, monsterId, size, at }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!gameId || !metric) return;
        let off = false;
        setLoading(true);
        setError(null);
        setData((d) => (d && d.Game === gameId ? d : null));
        api.getLeaderboard(gameId, { period, metric, monsterId: monsterId || undefined, size, at: at || undefined })
            .then((r) => !off && setData(r))
            .catch((e) => !off && setError(e.message))
            .finally(() => !off && setLoading(false));
        return () => {
            off = true;
        };
    }, [gameId, period, metric, monsterId, size, at]);

    return { data, loading, error };
}

/** Разрыв «⋮» там, где ранги идут не подряд (топ-5 … соседи … последний) */
function withGaps(rows) {
    const out = [];
    let prev = 0;
    for (const r of rows) {
        if (prev && r.Rank !== prev + 1) out.push({ gap: true, key: `gap-${prev}` });
        out.push(r);
        prev = r.Rank;
    }
    return out;
}

function Chip({ hud, active, onClick, children }) {
    if (hud) {
        return (
            <button
                onClick={onClick}
                style={{
                    fontFamily: MONO,
                    fontSize: "0.8em",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    padding: "0.25em 0.6em",
                    borderRadius: "0.5em",
                    border: `1px solid ${active ? "#9a63c4" : G.line}`,
                    background: active ? "#5e3283" : "transparent",
                    color: active ? "#ecd4ff" : G.dim,
                }}
            >
                {children}
            </button>
        );
    }
    return (
        <button
            onClick={onClick}
            className={`px-2 py-1 rounded border text-[11px] font-bold uppercase ${
                active ? "bg-primary text-black border-primary" : "bg-black/40 text-white border-white/30"
            }`}
        >
            {children}
        </button>
    );
}

function NavBtn({ disabled, onClick, label, children }) {
    return (
        <button
            disabled={disabled}
            onClick={onClick}
            aria-label={label}
            className={`w-9 h-9 rounded border text-lg font-bold leading-none shrink-0 ${
                disabled
                    ? "opacity-30 border-white/20 text-white/50"
                    : "bg-black/40 text-white border-white/30 active:scale-95"
            }`}
        >
            {children}
        </button>
    );
}

// Единая строка в em: размер задаёт родитель (в игре 3*u, на странице 14px)
function Row({ row, ordered }) {
    const [main, ...rest] = ordered;
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: "0.6em",
                padding: "0.2em 0.5em",
                borderBottom: `1px solid ${G.line}`,
                background: row.Mine ? G.mine : "transparent",
                color: G.green,
                fontFamily: MONO,
            }}
        >
            <span style={{ width: "2.6em", flexShrink: 0, fontWeight: 700, fontSize: "1.1em" }}>#{row.Rank}</span>

            {row.SpriteUrl ? (
                <img
                    src={row.SpriteUrl}
                    alt=""
                    draggable={false}
                    style={{ width: "2em", height: "2em", objectFit: "contain", flexShrink: 0 }}
                />
            ) : (
                <div style={{ width: "2em", flexShrink: 0 }} />
            )}

            <div style={{ flex: 1, minWidth: 0, lineHeight: 1.1 }}>
                <div
                    style={{
                        fontWeight: 700,
                        textTransform: "uppercase",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                    }}
                >
                    {row.Name}
                </div>
                <div
                    style={{
                        fontSize: "0.6em",
                        color: G.dim,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                    }}
                >
                    BID#:{row.BorfId}
                </div>
            </div>

            <div style={{ textAlign: "right", flexShrink: 0, lineHeight: 1.05 }}>
                <div style={{ fontSize: "1.5em", fontWeight: 700 }}>{fmtValue(main, row.Metrics[main.Key])}</div>
                {rest.map((d) => (
                    <div key={d.Key} style={{ fontSize: "0.6em", color: G.dim }}>
                        {fmtValue(d, row.Metrics[d.Key])}
                    </div>
                ))}
            </div>
        </div>
    );
}

function Msg({ hud, children }) {
    return hud ? (
        <div style={{ textAlign: "center", color: G.dim, fontFamily: MONO }}>{children}</div>
    ) : (
        <div className="text-center text-white/80 text-sm py-4">{children}</div>
    );
}

/**
 * variant: "page" (tailwind) | "hud" (зелёный моно, em)
 * size:    "full" | "compact"
 * monsterId: 0 → фокус на лучшем монстре пользователя
 * Навигатор по прошлым периодам и «зал славы» доступны только в page-варианте.
 */
export default function LeaderboardTable({ gameId, monsterId = 0, variant = "page", size = "full", controls = true }) {
    const hud = variant === "hud";
    const { games, error: gamesError } = useGames();
    const game = games?.find((g) => g.Id === gameId);
    const [period, setPeriod] = useState("week");
    const [metric, setMetric] = useState(null);
    const [at, setAt] = useState(null); // null = текущий период, иначе "YYYY-MM-DD"
    const [historyOpen, setHistoryOpen] = useState(false);

    const activeMetric = game?.Metrics.some((m) => m.Key === metric) ? metric : game?.Metrics[0]?.Key;
    const { data, loading, error } = useLeaderboard({
        gameId: game ? gameId : null,
        period,
        metric: activeMetric,
        monsterId,
        size,
        at,
    });

    if (gamesError) return <Msg hud={hud}>Failed to load: {gamesError}</Msg>;
    if (!game) return <Msg hud={hud}>...</Msg>;

    const pickPeriod = (id) => {
        setPeriod(id);
        setAt(null);
    };

    const ordered = [
        game.Metrics.find((m) => m.Key === activeMetric),
        ...game.Metrics.filter((m) => m.Key !== activeMetric),
    ];
    const items = data ? withGaps(data.Rows) : [];
    const showNav = !hud && period !== "all" && data && data.Period === period;

    const rowStyle = hud ? { display: "flex", gap: "0.4em", justifyContent: "center" } : undefined;
    const rowClass = hud ? undefined : "flex gap-1 flex-wrap";

    return (
        <div
            className={hud ? undefined : "flex flex-col gap-2 w-full"}
            style={hud ? { width: "100%", display: "flex", flexDirection: "column", gap: "0.5em" } : undefined}
        >
            {controls && (
                <>
                    <div className={rowClass} style={rowStyle}>
                        {PERIODS.map((p) => (
                            <Chip key={p.id} hud={hud} active={p.id === period} onClick={() => pickPeriod(p.id)}>
                                {p.label}
                            </Chip>
                        ))}
                    </div>
                    {game.Metrics.length > 1 && (
                        <div className={rowClass} style={rowStyle}>
                            {game.Metrics.map((m) => (
                                <Chip
                                    key={m.Key}
                                    hud={hud}
                                    active={m.Key === activeMetric}
                                    onClick={() => setMetric(m.Key)}
                                >
                                    {m.Label}
                                </Chip>
                            ))}
                        </div>
                    )}
                </>
            )}

            {showNav && (
                <div className="flex items-center gap-2">
                    <NavBtn
                        label="previous period"
                        disabled={!data.HasPrev}
                        onClick={() => setAt(dayBefore(data.Start))}
                    >
                        ‹
                    </NavBtn>
                    <button
                        onClick={() => setHistoryOpen(true)}
                        className="flex-1 min-w-0 rounded border border-white/30 bg-black/40 px-3 py-1 text-center text-white active:scale-[0.98] transition-transform"
                    >
                        <div className="text-sm font-bold truncate">{fmtPeriod(period, data.Start, data.End)}</div>
                        <div className="text-[10px] text-white/70">
                            {data.Current ? `live · resets in ${fmtLeft(data.End)}` : "final standings"} · 🏆 history
                        </div>
                    </button>
                    <NavBtn label="next period" disabled={data.Current} onClick={() => setAt(dayKey(data.End))}>
                        ›
                    </NavBtn>
                </div>
            )}

            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    opacity: loading ? 0.5 : 1,
                    transition: "opacity .2s",
                    // в игре размер задаёт родитель (Over), на странице фиксируем сами
                    ...(hud
                        ? null
                        : {
                              fontSize: 14,
                              padding: "0.4em",
                              background: "rgba(5,18,13,0.9)",
                              border: `1px solid ${G.line}`,
                              borderRadius: 8,
                          }),
                }}
            >
                {hud && (
                    <div
                        style={{
                            fontFamily: MONO,
                            fontWeight: 700,
                            fontSize: "1.5em",
                            letterSpacing: "0.05em",
                            color: G.green,
                            textAlign: "center",
                            padding: "0.2em 0 0.4em",
                            borderBottom: `1px solid ${G.line}`,
                        }}
                    >
                        LEADERBOARD
                    </div>
                )}

                {error && <Msg hud>Failed to load: {error}</Msg>}
                {!error && data && items.length === 0 && (
                    <Msg hud>
                        {data.Current ? "No runs in this period yet. Be the first!" : "No runs in this period."}
                    </Msg>
                )}
                {!data && !error && <Msg hud>...</Msg>}

                {items.map((it) =>
                    it.gap ? (
                        <div
                            key={it.key}
                            style={{ textAlign: "center", color: G.dim, lineHeight: 0.8, fontFamily: MONO }}
                        >
                            ⋮
                        </div>
                    ) : (
                        <Row key={it.MonsterId} row={it} ordered={ordered} />
                    )
                )}
            </div>

            {!hud && data && data.Total > 0 && (
                <span className="text-xs text-white/80 text-center">
                    {data.MyRank > 0
                        ? `Your best monster: #${data.MyRank} of ${data.Total}`
                        : `${data.Total} ranked · your monsters have no runs in this period`}
                </span>
            )}

            {!hud && historyOpen && period !== "all" && (
                <Period
                    game={game}
                    metric={activeMetric}
                    period={period}
                    selectedStart={data?.Start}
                    onClose={() => setHistoryOpen(false)}
                    onPick={(day) => {
                        setAt(day);
                        setHistoryOpen(false);
                    }}
                />
            )}
        </div>
    );
}
