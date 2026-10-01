import { useEffect, useRef, useState } from "react";
import api from "../api";

const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 90000;

/**
 * Given the monster object passed via navigation state, polls
 * GET /api/monsters/:id until sprites are ready, permanently failed,
 * or we've waited long enough that we should just stop blocking the player.
 *
 * Returns one of three states:
 *   - "loading"  → show GameLoadingScreen
 *   - "ready"    → sprites.idle / sprites.walk / sprites.hit are all set
 *   - "degraded" → sprites never arrived in time; game should still be
 *                  playable using a single static image (monster.ThumbUrl
 *                  or monster.ImageUrl) instead of animated sprites
 */
export function useMonsterSprites(initialMonster) {
    const [monster, setMonster] = useState(initialMonster);
    const [status, setStatus] = useState(initialMonster?.SpriteStatus === "ready" ? "ready" : "loading");

    const elapsedRef = useRef(0);
    const stoppedRef = useRef(status !== "loading");

    useEffect(() => {
        if (stoppedRef.current) return;

        const intervalId = setInterval(async () => {
            if (stoppedRef.current) return;

            elapsedRef.current += POLL_INTERVAL_MS;

            if (elapsedRef.current >= POLL_TIMEOUT_MS) {
                stoppedRef.current = true;
                setStatus("degraded");
                clearInterval(intervalId);
                return;
            }

            try {
                const { Monster: fresh } = await api.getMonster(initialMonster.Id);
                if (stoppedRef.current) return;

                if (fresh.SpriteStatus === "ready") {
                    stoppedRef.current = true;
                    setMonster(fresh);
                    setStatus("ready");
                    clearInterval(intervalId);
                } else if (fresh.SpriteStatus === "failed") {
                    // don't stop yet — the server-side watchdog will keep
                    // retrying in the background, so a "failed" snapshot
                    // right now doesn't mean it's failed forever. Just keep
                    // polling until it either recovers or we hit the timeout.
                    setMonster(fresh);
                }
            } catch (err) {
                // transient network hiccup — ignore and try again next tick
                console.error("sprite status poll failed:", err);
            }
        }, POLL_INTERVAL_MS);

        return () => clearInterval(intervalId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const sprites =
        status === "ready"
            ? {
                  idle: monster.SpriteIdleUrl,
                  walk: monster.SpriteWalkUrl,
                  hit: monster.SpriteHitUrl,
              }
            : null;

    const staticUrl = monster.ThumbUrl || monster.ImageUrl;

    return { status, monster, sprites, staticUrl };
}
