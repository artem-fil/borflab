import LoadingScreen from "@components/LoadingScreen";
import Dodge from "@games/Dodge";
import { useMonsterSprites } from "@hooks/monsterSprites";
import { useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

const GAME_COMPONENTS = {
    dodge: Dodge,
};

export default function Play() {
    const { gameId } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const initialMonster = location.state?.monster;

    useEffect(() => {
        if (!initialMonster) {
            navigate("/library", { replace: true });
        }
    }, [initialMonster, navigate]);

    const { status, monster, sprites, staticUrl } = useMonsterSprites(initialMonster);

    if (!initialMonster) return null;

    const Game = GAME_COMPONENTS[gameId];
    if (!Game) {
        // unknown/unbuilt game id — bounce back rather than show a blank screen
        navigate("/games", { state: { monster: initialMonster }, replace: true });
        return null;
    }

    if (status === "loading") {
        return <LoadingScreen />;
    }

    return (
        <Game
            sprites={sprites}
            staticUrl={staticUrl}
            monsterName={monster.Name}
            onExit={() => navigate("/games", { state: { monster }, replace: true })}
        />
    );
}
