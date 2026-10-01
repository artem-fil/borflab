import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { GAMES } from "../config.js";

const BEST_STATS = { rank: 12, score: 4820 };

export default function Games() {
    const navigate = useNavigate();
    const location = useLocation();
    const monster = location.state?.monster;

    useEffect(() => {
        if (!monster) {
            navigate("/library", { replace: true });
        }
    }, [monster, navigate]);

    if (!monster) {
        return null;
    }

    const handleSelectGame = (game) => {
        if (!game.active) return;
        navigate(`/play/${game.id}`, { state: { monster } });
    };

    return (
        <div className="flex-grow flex flex-col items-center min-h-0 overflow-hidden">
            <div className="w-full flex items-center gap-3 px-4 py-4">
                <button
                    onClick={() => navigate(-1)}
                    className="w-6 h-6 p-0 bg-transparent border-none text-white text-xl leading-none"
                    aria-label="back"
                >
                    ←
                </button>
                <div className="flex flex-col">
                    <h2 className="text-white font-bold text-xl">Choose a game</h2>
                    <span className="text-xs">Playing as {monster.Name}</span>
                </div>
            </div>

            <div className="w-full flex-grow overflow-y-auto px-4 py-2">
                <div className="flex flex-col gap-2 pb-2">
                    {GAMES.map((game) => (
                        <div
                            key={game.id}
                            onClick={() => handleSelectGame(game)}
                            className={`relative w-full aspect-[2/1] rounded-2xl overflow-hidden border-2 ${
                                game.active
                                    ? "border-black cursor-pointer active:scale-[0.98] transition-transform"
                                    : "border-gray-500 cursor-not-allowed"
                            }`}
                        >
                            {/* Картинка */}
                            {game.image ? (
                                <img
                                    src={game.image}
                                    alt={game.name}
                                    draggable={false}
                                    className={`absolute inset-0 w-full h-full object-cover ${
                                        game.active ? "" : "grayscale opacity-60"
                                    }`}
                                />
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center bg-white/90 text-7xl">
                                    {game.icon}
                                </div>
                            )}

                            {/* Затемнённый градиент снизу */}
                            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 via-black/50 to-transparent pointer-events-none" />

                            {/* Нижняя панель: теглайн + достижения */}
                            <div className="absolute inset-x-0 bottom-0 p-3 flex items-end justify-between gap-3">
                                <span className="text-white text-xs leading-tight font-medium drop-shadow flex-1">
                                    {game.active ? game.description : "Coming soon"}
                                </span>

                                {game.active && (
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <span className="flex items-center gap-1 rounded-full bg-black/50 backdrop-blur-sm px-2 py-1 text-white text-xs font-bold">
                                            🏆 #{BEST_STATS.rank}
                                        </span>
                                        <span className="flex items-center gap-1 rounded-full bg-black/50 backdrop-blur-sm px-2 py-1 text-white text-xs font-bold">
                                            ⭐ {BEST_STATS.score.toLocaleString("en-US")}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
