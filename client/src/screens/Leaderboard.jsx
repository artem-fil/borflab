import LeaderboardTable from "@components/LeaderboardTable"; // ← поправь пути
import { useGames } from "@components/LeaderboardUtils";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { GAMES } from "../config.js";

// Экран /leaderboard (бывший LeaderboardPage). Можно прийти с state: { gameId, monsterId }.
// Вкладки игр показываются всегда — даже когда в реестре одна игра.
export default function Leaderboard() {
    const navigate = useNavigate();
    const location = useLocation();
    const { games, error } = useGames();
    const [picked, setPicked] = useState(location.state?.gameId ?? null);
    const monsterId = location.state?.monsterId ?? 0;
    const active = picked ?? games?.[0]?.Id;
    console.log(games, GAMES);

    return (
        <div className="flex-grow flex flex-col items-center min-h-0 overflow-hidden">
            <div className="w-full flex items-center gap-3 px-4 py-2">
                <button
                    onClick={() => navigate(-1)}
                    className="w-6 h-6 p-0 bg-transparent border-none text-white text-xl leading-none"
                    aria-label="back"
                >
                    ←
                </button>
                <div className="flex flex-col">
                    <h2 className="text-white font-bold text-xl">Leaderboard</h2>
                    <span className="text-xs">Best run per monster</span>
                </div>
            </div>

            <div className="w-full flex gap-2 px-4 pb-1 overflow-x-auto shrink-0">
                {!games && !error && <span className="text-xs py-1">...</span>}
                {games?.map((g) => (
                    <img
                        key={g.Id}
                        onClick={() => setPicked(g.Id)}
                        src={GAMES[g.Id].imageSm}
                        alt={g.name}
                        draggable={false}
                        className={`rounded border w-12 h-6 object-cover`}
                    />
                ))}
            </div>

            <div className="w-full h-2 border-b-2 border-black shadow-md bg-black/60" />

            <div
                style={{ backgroundBlendMode: "multiply", backgroundColor: "rgba(0,0,0,0.3)" }}
                className="w-full flex-grow bg-metal bg-cover bg-center bg-no-repeat px-4 py-4 min-h-0 overflow-y-auto"
            >
                {error && <div className="text-white text-center text-sm">Failed to load: {error}</div>}
                {/* key: при смене игры состояние таблицы (период, метрика, история) сбрасывается */}
                {active && <LeaderboardTable key={active} gameId={active} monsterId={monsterId} variant="page" />}
            </div>

            <div className="w-full h-2 border-b-2 border-black shadow-md bg-black/60" />
        </div>
    );
}
