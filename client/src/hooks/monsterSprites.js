import { useEffect, useState } from "react";
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
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        if (status !== "loading") return;

        let cancelled = false;
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

        (async () => {
            try {
                // 1. старт (идемпотентный: StrictMode / повторный заход вернут тот же taskId)
                let start;
                for (let i = 0; i < 5; i++) {
                    start = await api.startSprites(initialMonster.Id);
                    if (start.status !== "busy") break;
                    await sleep(1000);
                    if (cancelled) return;
                }
                if (cancelled) return;

                if (start.status === "ready") {
                    setMonster(start.Monster);
                    setStatus("ready");
                    return;
                }
                if (!start.taskId) throw new Error("sprite task was not started");

                // 2. поллим задачу
                const deadline = Date.now() + POLL_TIMEOUT_MS;
                while (!cancelled && Date.now() < deadline) {
                    await sleep(POLL_INTERVAL_MS);
                    if (cancelled) return;

                    let task;
                    try {
                        task = await api.getTaskStatus(start.taskId);
                    } catch (err) {
                        console.error("sprite task poll failed:", err);
                        continue; // временный сбой сети
                    }

                    // ⚠ подстрой под реальную форму ответа /api/task/:id
                    setProgress(task.progress ?? 0);

                    if (task.failed) throw new Error(task.error || "sprite generation failed");

                    if (task.done) {
                        const { Monster: fresh } = await api.getMonster(initialMonster.Id);
                        if (cancelled) return;
                        setMonster(fresh);
                        setProgress(100);
                        setStatus("ready");
                        return;
                    }
                }
                if (!cancelled) setStatus("degraded"); // таймаут
            } catch (err) {
                console.error("sprite generation error:", err);
                if (!cancelled) setStatus("degraded");
            }
        })();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const sprites =
        status === "ready"
            ? { idle: monster.SpriteIdleUrl, walk: monster.SpriteWalkUrl, hit: monster.SpriteHitUrl }
            : null;
    const staticUrl = monster.ThumbUrl || monster.ImageUrl;

    return { status, monster, sprites, staticUrl, progress };
}
