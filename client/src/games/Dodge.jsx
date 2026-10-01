import blowSound from "@sounds/blow.ogg";
import eatSound from "@sounds/eat.ogg";
import trackSound from "@sounds/track1.mp3";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------
const INITIAL_LIVES = 3;
const MAX_LIVES = 5;
const HIT_STUN_MS = 1000; // i-frame window after taking a hit, matches the blink duration
const PLAYER_MOVE_SPEED = 0.45; // px per ms

const PLAYER_SIZE_RATIO = 0.16; // of container width
const OBJECT_SIZE_RATIO = 0.08;

// Difficulty grows logarithmically: fast at first, slower later, but never stops.
// level = ln(1 + t / TAU)
const DIFFICULTY_TAU_MS = 20000;
const SPAWN_INTERVAL_START_MS = 1400;
const SPAWN_INTERVAL_GAIN = 0.5; // interval = start / (1 + gain * level)
const SPAWN_INTERVAL_MIN_MS = 200; // safety floor only
const FALL_SPEED_START = 0.08; // px per ms
const FALL_SPEED_GAIN = 0.6; // speed = start * (1 + gain * level)
const HOSTILE_CHANCE_START = 0.3;
const HOSTILE_CHANCE_GAIN = 0.08;
const HOSTILE_CHANCE_MAX = 0.55;

// special drops (share of all spawns)
const HEART_CHANCE = 0.015;
const ICE_CHANCE = 0.07;
const HEART_BONUS_POINTS = 50; // if already at MAX_LIVES
const ICE_POINTS = 20;
const PEPPER_POINTS = 20;
const SLOW_DURATION_MS = 5000;
const SLOW_FACTOR = 0.25;
const PEPPER_CHANCE = 0.08;
const BOOST_DURATION_MS = 5000;
const BOOST_FACTOR = 1.75;

// hostile motion
const ZIGZAG_UNLOCK_MS = 12000;
const SPIRAL_UNLOCK_MS = 30000;
const ZIGZAG_OMEGA = 0.008; // rad per ms
const SPIRAL_OMEGA = 0.008;
const ZIGZAG_AMP_RATIO = 0.2; // of container width
const SPIRAL_AMP_RATIO = 0.1;

// invulnerability
const INVULN_EVERY_POINTS = 1000;
const INVULN_DURATION_MS = 10000;
const INVULN_SCALE = 1.35;
const INVULN_FLICKER_MS = 80;

const COMBO_FLASH_MS = 800;

const ICE_EMOJI = "🧊";
const PEPPER_EMOJI = "🌶️";
const HEART_EMOJI = "❤️";
const HOSTILE_EMOJI = { straight: "💣", zigzag: "🧨", spiral: "🌀" };

// ordered cheap -> expensive; the straight uses this order
const FRUITS = [
    { id: "apple", emoji: "🍎", person: "👩🏻‍🚒", points: 10 },
    { id: "banana", emoji: "🍌", person: "👨‍⚕️", points: 15 },
    { id: "grape", emoji: "🍇", person: "👨‍🌾", points: 20 },
];
const FRUIT_BY_ID = Object.fromEntries(FRUITS.map((f) => [f.id, f]));

// bonus = (mult - 1) * sum of the fruits' base points (base points are already awarded)
function makeCombo(id, fruits, mult) {
    const sum = fruits.reduce((s, fid) => s + FRUIT_BY_ID[fid].points, 0);
    return { id, fruits, mult, bonus: sum * (mult - 1) };
}
const COMBOS = [
    makeCombo("triple-apple", ["apple", "apple", "apple"], 2),
    makeCombo("triple-banana", ["banana", "banana", "banana"], 3),
    makeCombo("triple-grape", ["grape", "grape", "grape"], 4),
    makeCombo(
        "straight",
        FRUITS.map((f) => f.id),
        10
    ),
];
const TRIPLE_BY_FRUIT = Object.fromEntries(COMBOS.filter((c) => c.id !== "straight").map((c) => [c.fruits[0], c]));
const STRAIGHT = COMBOS[COMBOS.length - 1];

const EMPTY_COMBO = { runFruit: null, runCount: 0, straightIdx: 0, flashId: null, flashBonus: 0 };

function randomBetween(min, max) {
    return min + Math.random() * (max - min);
}

function pickHostileMotion(t) {
    const wZig = t > ZIGZAG_UNLOCK_MS ? 0.7 : 0;
    const wSpiral = t > SPIRAL_UNLOCK_MS ? 0.5 : 0;
    const roll = Math.random() * (1 + wZig + wSpiral);
    if (roll < 1) return "straight";
    if (roll < 1 + wZig) return "zigzag";
    return "spiral";
}

function SegmentedToggle({ label, options, value, onChange }) {
    return (
        <div className="flex flex-col items-center gap-1">
            <span className="text-xs opacity-80">{label}</span>
            <div className="flex rounded-full bg-white/20 p-1">
                {options.map((o) => (
                    <button
                        key={String(o.value)}
                        onClick={() => onChange(o.value)}
                        className={`px-3 py-1 rounded-full text-sm font-bold ${
                            value === o.value ? "bg-white text-black" : "text-white"
                        }`}
                    >
                        {o.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

export default function Dodge({ sprites, staticUrl, monsterName, onExit }) {
    const containerRef = useRef(null);
    const playerElRef = useRef(null);
    const invulnFillRef = useRef(null);
    const objectsRef = useRef([]); // [{id, el, x, y, baseX, baseY, age, size, speed, kind, motion, ...}]

    // mutable, frame-driven values that don't need React re-renders
    const playerXRef = useRef(0);
    const playerYRef = useRef(0);
    const movingDirRef = useRef(0); // -1 left, 0 idle, 1 right
    const facingRef = useRef(1); // last non-zero direction; sprite art faces right
    const pressedKeysRef = useRef(new Set());
    const nextSpawnAtRef = useRef(0);
    const lastFrameRef = useRef(0);
    const rafRef = useRef(null);
    const pausedRef = useRef(false);
    const livesRef = useRef(INITIAL_LIVES);
    const scoreRef = useRef(0);
    const gameOverRef = useRef(false);
    const comboRef = useRef({ ...EMPTY_COMBO });
    const flashTimerRef = useRef(null);

    // game clock (ms of un-paused play); all timers below are on this clock
    const gameTimeRef = useRef(0);
    const hitUntilRef = useRef(0);
    const slowUntilRef = useRef(0);
    const boostUntilRef = useRef(0);
    const invulnUntilRef = useRef(0);

    const eatSfxRef = useRef(null);
    const blowSfxRef = useRef(null);
    const musicRef = useRef(null);

    const [started, setStarted] = useState(false);
    const [night, setNight] = useState(false);
    const [people, setPeople] = useState(false);
    const peopleRef = useRef(people);
    peopleRef.current = people;

    const [runId, setRunId] = useState(0);
    const [spriteState, setSpriteState] = useState("idle"); // idle | walk | hit
    const [score, setScore] = useState(0);
    const [lives, setLives] = useState(INITIAL_LIVES);
    const [gameOver, setGameOver] = useState(false);
    const [comboView, setComboView] = useState(EMPTY_COMBO);
    const [, forceRender] = useState(0); // ticks so the objects layer re-renders as objects spawn/despawn

    const stars = useMemo(
        () =>
            Array.from({ length: 30 }, () => ({
                x: Math.random() * 100,
                y: Math.random() * 65,
                s: 1 + Math.random() * 2,
                o: 0.4 + Math.random() * 0.6,
            })),
        []
    );

    const isStatic = !sprites;
    const spriteSrc = isStatic
        ? staticUrl
        : spriteState === "hit"
          ? sprites.hit
          : spriteState === "walk"
            ? sprites.walk
            : sprites.idle;

    const glyph = (fruitId) => (people ? FRUIT_BY_ID[fruitId].person : FRUIT_BY_ID[fruitId].emoji);

    const setDirection = useCallback((dir) => {
        movingDirRef.current = dir;
    }, []);

    // ---- scoring / invulnerability charge ----
    const addScore = useCallback((n) => {
        const prev = scoreRef.current;
        const next = prev + n;
        scoreRef.current = next;
        setScore(next);
        const crossings = Math.floor(next / INVULN_EVERY_POINTS) - Math.floor(prev / INVULN_EVERY_POINTS);
        if (crossings > 0) {
            const base = Math.max(invulnUntilRef.current, gameTimeRef.current);
            invulnUntilRef.current = base + crossings * INVULN_DURATION_MS;
        }
    }, []);

    // ---- combos ----
    const resetCombo = useCallback(() => {
        comboRef.current = { ...EMPTY_COMBO };
        setComboView({ ...EMPTY_COMBO });
    }, []);

    const registerFruit = useCallback(
        (fruitId) => {
            const c = comboRef.current;

            if (c.runFruit === fruitId) c.runCount += 1;
            else {
                c.runFruit = fruitId;
                c.runCount = 1;
            }

            if (fruitId === FRUITS[c.straightIdx].id) c.straightIdx += 1;
            else c.straightIdx = fruitId === FRUITS[0].id ? 1 : 0;

            let done = null;
            if (c.straightIdx === FRUITS.length) done = STRAIGHT;
            else if (c.runCount === 3) done = TRIPLE_BY_FRUIT[fruitId] ?? null;

            if (done) {
                addScore(done.bonus);
                comboRef.current = { ...EMPTY_COMBO, flashId: done.id, flashBonus: done.bonus };
                setComboView({ ...comboRef.current });
                clearTimeout(flashTimerRef.current);
                flashTimerRef.current = setTimeout(() => {
                    comboRef.current = { ...comboRef.current, flashId: null, flashBonus: 0 };
                    setComboView({ ...comboRef.current });
                }, COMBO_FLASH_MS);
            } else {
                comboRef.current = { ...c, flashId: c.flashId, flashBonus: c.flashBonus };
                setComboView({ ...comboRef.current });
            }
        },
        [addScore]
    );

    useEffect(() => () => clearTimeout(flashTimerRef.current), []);

    // ---- spawning ----
    const spawnObject = useCallback((containerWidth, t) => {
        const size = containerWidth * OBJECT_SIZE_RATIO;
        const level = Math.log(1 + t / DIFFICULTY_TAU_MS);
        const speed = FALL_SPEED_START * (1 + FALL_SPEED_GAIN * level) * randomBetween(0.85, 1.2);
        const hostileChance = Math.min(HOSTILE_CHANCE_START + HOSTILE_CHANCE_GAIN * level, HOSTILE_CHANCE_MAX);

        const roll = Math.random();
        const obj = {
            id: `${Date.now()}-${Math.random()}`,
            size,
            speed,
            age: 0,
            phase: Math.random() * Math.PI * 2,
            motion: "straight",
            amp: 0,
            points: 0,
            fruitId: null,
        };

        if (roll < HEART_CHANCE) {
            obj.kind = "heart";
            obj.emoji = HEART_EMOJI;
        } else if (roll < HEART_CHANCE + ICE_CHANCE) {
            obj.kind = "ice";
            obj.emoji = ICE_EMOJI;
            obj.points = ICE_POINTS;
        } else if (roll < HEART_CHANCE + ICE_CHANCE + PEPPER_CHANCE) {
            obj.kind = "pepper";
            obj.emoji = PEPPER_EMOJI;
            obj.points = PEPPER_POINTS;
        } else if (Math.random() < hostileChance) {
            obj.kind = "hostile";
            obj.motion = pickHostileMotion(t);
            obj.emoji = HOSTILE_EMOJI[obj.motion];
            if (obj.motion === "zigzag") obj.amp = containerWidth * ZIGZAG_AMP_RATIO;
            if (obj.motion === "spiral") obj.amp = containerWidth * SPIRAL_AMP_RATIO;
        } else {
            const fruit = FRUITS[Math.floor(Math.random() * FRUITS.length)];
            obj.kind = "fruit";
            obj.fruitId = fruit.id;
            obj.emoji = peopleRef.current ? fruit.person : fruit.emoji;
            obj.points = fruit.points;
        }

        // keep the whole swing of a wobbling projectile inside the field
        const margin = obj.amp;
        obj.baseX = randomBetween(margin, Math.max(margin, containerWidth - size - margin));
        obj.baseY = -size - obj.amp;
        obj.x = obj.baseX;
        obj.y = obj.baseY;

        objectsRef.current.push(obj);
        forceRender((n) => n + 1);
    }, []);

    const collect = useCallback(
        (obj, t) => {
            playSfx(eatSfxRef, 0.8);
            if (obj.kind === "fruit") {
                addScore(obj.points);
                registerFruit(obj.fruitId);
            } else if (obj.kind === "ice") {
                addScore(obj.points);
                slowUntilRef.current = t + SLOW_DURATION_MS;
            } else if (obj.kind === "pepper") {
                addScore(obj.points);
                boostUntilRef.current = t + BOOST_DURATION_MS;
            } else if (obj.kind === "heart") {
                if (livesRef.current < MAX_LIVES) {
                    livesRef.current += 1;
                    setLives(livesRef.current);
                } else {
                    addScore(HEART_BONUS_POINTS);
                }
            }
        },
        [addScore, registerFruit]
    );

    const playSfx = useCallback((ref, volume = 1) => {
        const base = ref.current;
        if (!base) return;
        const a = base.cloneNode();
        a.volume = volume;
        a.play().catch(() => {});
    }, []);
    const takeHit = useCallback(
        (t) => {
            playSfx(blowSfxRef);
            hitUntilRef.current = t + HIT_STUN_MS;
            setSpriteState("hit");
            livesRef.current -= 1;
            setLives(livesRef.current);
            resetCombo();

            if (livesRef.current <= 0) {
                gameOverRef.current = true;
                setGameOver(true);
            }
        },
        [resetCombo, playSfx]
    );

    // ---- main loop ----
    const runLoop = useCallback(() => {
        const container = containerRef.current;
        if (!container) return () => {};

        const rect = container.getBoundingClientRect();
        const containerWidth = rect.width;
        const containerHeight = rect.height;
        const playerSize = containerWidth * PLAYER_SIZE_RATIO;
        const groundY = containerHeight - playerSize - 90; // clears the bottom control bar

        // fresh run
        playerXRef.current = (containerWidth - playerSize) / 2;
        playerYRef.current = groundY;
        gameTimeRef.current = 0;
        hitUntilRef.current = 0;
        slowUntilRef.current = 0;
        boostUntilRef.current = 0;
        invulnUntilRef.current = 0;
        scoreRef.current = 0;
        livesRef.current = INITIAL_LIVES;
        gameOverRef.current = false;
        facingRef.current = 1;
        objectsRef.current = [];
        nextSpawnAtRef.current = 0;
        lastFrameRef.current = performance.now();

        const tick = (now) => {
            if (gameOverRef.current) return;

            if (pausedRef.current) {
                lastFrameRef.current = now;
                rafRef.current = requestAnimationFrame(tick);
                return;
            }

            const dt = Math.min(now - lastFrameRef.current, 50); // cap so a stall can't teleport things
            lastFrameRef.current = now;
            gameTimeRef.current += dt;
            const t = gameTimeRef.current;

            const inHitStun = t < hitUntilRef.current;
            const slowed = t < slowUntilRef.current;
            const boosted = t < boostUntilRef.current;
            const invuln = t < invulnUntilRef.current;
            const dir = movingDirRef.current;
            if (dir !== 0) facingRef.current = dir;

            // --- player movement ---
            if (!inHitStun && dir !== 0) {
                const speed = PLAYER_MOVE_SPEED * (slowed ? SLOW_FACTOR : 1) * (boosted ? BOOST_FACTOR : 1);
                playerXRef.current += dir * speed * dt;
                playerXRef.current = Math.max(0, Math.min(containerWidth - playerSize, playerXRef.current));
            }

            // sprite state is driven purely by inHitStun / dir "right now" —
            // no dependence on the previous state, so it can't get stuck.
            setSpriteState(inHitStun ? "hit" : dir !== 0 ? "walk" : "idle");

            if (playerElRef.current) {
                // art faces right, so only flip when the last direction was left
                const flip = !isStatic && facingRef.current < 0 ? -1 : 1;
                const scale = invuln ? INVULN_SCALE : 1;
                const el = playerElRef.current;
                el.style.transform = `translate(${playerXRef.current}px, ${playerYRef.current}px) scale(${flip * scale}, ${scale})`;

                if (inHitStun) {
                    const blinkOn = Math.floor((hitUntilRef.current - t) / 100) % 2 === 0;
                    el.style.opacity = blinkOn ? "0.3" : "1";
                } else if (invuln) {
                    const flickerOn = Math.floor(t / INVULN_FLICKER_MS) % 2 === 0;
                    el.style.opacity = flickerOn ? "0.55" : "1";
                } else {
                    el.style.opacity = "1";
                }

                const fx = [];
                if (invuln) fx.push("drop-shadow(0 0 8px #fbbf24)");
                if (slowed) fx.push("drop-shadow(0 0 8px #38bdf8)", "brightness(1.2)");
                if (boosted) fx.push("drop-shadow(0 0 8px #f87171)", "saturate(1.4)");
                el.style.filter = fx.length ? fx.join(" ") : "none";
            }

            // --- invulnerability bar: fills while charging, drains while active ---
            const fill = invulnFillRef.current;
            if (fill) {
                if (invuln) {
                    const pct = Math.min(100, ((invulnUntilRef.current - t) / INVULN_DURATION_MS) * 100);
                    fill.style.width = `${pct}%`;
                    fill.style.backgroundColor = "#fbbf24";
                } else {
                    fill.style.width = `${((scoreRef.current % INVULN_EVERY_POINTS) / INVULN_EVERY_POINTS) * 100}%`;
                    fill.style.backgroundColor = "#e2e8f0";
                }
            }

            // --- spawning ---
            if (t >= nextSpawnAtRef.current) {
                spawnObject(containerWidth, t);
                const level = Math.log(1 + t / DIFFICULTY_TAU_MS);
                const interval = Math.max(
                    SPAWN_INTERVAL_MIN_MS,
                    SPAWN_INTERVAL_START_MS / (1 + SPAWN_INTERVAL_GAIN * level)
                );
                nextSpawnAtRef.current = t + interval * randomBetween(0.8, 1.2);
            }

            // --- falling objects ---
            const hitScale = invuln ? INVULN_SCALE : 1;
            const growX = (playerSize * (hitScale - 1)) / 2; // grows equally left and right
            const growY = playerSize * (hitScale - 1); // grows upward only, feet stay put
            const playerLeft = playerXRef.current - growX;
            const playerRight = playerXRef.current + playerSize + growX;
            const hitTop = groundY - growY;
            const hitBottom = groundY + playerSize;

            let stunned = inHitStun;
            let removedAny = false;

            objectsRef.current = objectsRef.current.filter((obj) => {
                obj.age += dt;
                obj.baseY += obj.speed * dt;

                if (obj.motion === "zigzag") {
                    const tri = (2 / Math.PI) * Math.asin(Math.sin(obj.phase + obj.age * ZIGZAG_OMEGA));
                    obj.x = obj.baseX + tri * obj.amp;
                    obj.y = obj.baseY;
                } else if (obj.motion === "spiral") {
                    const a = obj.phase + obj.age * SPIRAL_OMEGA;
                    obj.x = obj.baseX + Math.cos(a) * obj.amp;
                    obj.y = obj.baseY + Math.sin(a) * obj.amp * 0.6;
                } else {
                    obj.x = obj.baseX;
                    obj.y = obj.baseY;
                }
                if (obj.el) obj.el.style.transform = `translate(${obj.x}px, ${obj.y}px)`;

                const objBottom = obj.y + obj.size;
                const overlapsX = obj.x + obj.size > playerLeft && obj.x < playerRight;
                const overlapsY = objBottom >= hitTop && obj.y <= hitBottom;

                if (!stunned && overlapsX && overlapsY) {
                    if (obj.kind === "hostile") {
                        // while invulnerable, hostile projectiles pass straight through
                        if (!invuln) {
                            takeHit(t);
                            stunned = true;
                            removedAny = true;
                            return false;
                        }
                    } else {
                        collect(obj, t);
                        removedAny = true;
                        return false;
                    }
                }

                if (obj.baseY > containerHeight + obj.amp) {
                    removedAny = true;
                    return false;
                }

                return true;
            });

            if (removedAny) forceRender((n) => n + 1);

            rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);

        const handleVisibility = () => {
            pausedRef.current = document.hidden;
        };
        document.addEventListener("visibilitychange", handleVisibility);

        return () => {
            cancelAnimationFrame(rafRef.current);
            document.removeEventListener("visibilitychange", handleVisibility);
            objectsRef.current = [];
        };
    }, [isStatic, spawnObject, takeHit, collect]);

    useEffect(() => {
        const eat = new Audio(eatSound);
        const blow = new Audio(blowSound);
        const music = new Audio(trackSound);
        eat.preload = "auto";
        blow.preload = "auto";
        music.loop = true;
        music.volume = 0.4;

        eatSfxRef.current = eat;
        blowSfxRef.current = blow;
        musicRef.current = music;

        return () => {
            music.pause();
            eat.pause();
            blow.pause();
        };
    }, []);

    // keyboard controls, mirrors the on-screen left/right buttons
    useEffect(() => {
        const updateDirectionFromKeys = () => {
            const keys = pressedKeysRef.current;
            const left = keys.has("ArrowLeft") || keys.has("a") || keys.has("A");
            const right = keys.has("ArrowRight") || keys.has("d") || keys.has("D");
            if (left && !right) setDirection(-1);
            else if (right && !left) setDirection(1);
            else setDirection(0);
        };

        const handleKeyDown = (e) => {
            if (["ArrowLeft", "ArrowRight", "a", "A", "d", "D"].includes(e.key)) {
                pressedKeysRef.current.add(e.key);
                updateDirectionFromKeys();
            }
        };
        const handleKeyUp = (e) => {
            if (pressedKeysRef.current.has(e.key)) {
                pressedKeysRef.current.delete(e.key);
                updateDirectionFromKeys();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
            pressedKeysRef.current.clear();
        };
    }, [setDirection]);

    // (re)start the loop when the game starts or when runId is bumped by restart
    useEffect(() => {
        if (!started) return;
        return runLoop();
    }, [started, runId, runLoop]);

    useEffect(() => {
        const music = musicRef.current;
        if (!music) return;
        if (started && !gameOver) music.play().catch(() => {});
        else music.pause();
    }, [started, gameOver]);

    // пауза музыки при сворачивании вкладки
    useEffect(() => {
        const onVisibility = () => {
            const music = musicRef.current;
            if (!music) return;
            if (document.hidden) music.pause();
            else if (started && !gameOver) music.play().catch(() => {});
        };
        document.addEventListener("visibilitychange", onVisibility);
        return () => document.removeEventListener("visibilitychange", onVisibility);
    }, [started, gameOver]);

    const registerObjectEl = useCallback(
        (id) => (el) => {
            const obj = objectsRef.current.find((o) => o.id === id);
            if (obj && el) {
                obj.el = el;
                el.style.transform = `translate(${obj.x}px, ${obj.y}px)`; // avoids a 1-frame flash at 0,0
            }
        },
        []
    );

    const handleRestart = () => {
        clearTimeout(flashTimerRef.current);
        if (musicRef.current) musicRef.current.currentTime = 0;
        comboRef.current = { ...EMPTY_COMBO };
        movingDirRef.current = 0;
        setComboView({ ...EMPTY_COMBO });
        setLives(INITIAL_LIVES);
        setScore(0);
        setGameOver(false);
        setSpriteState("idle");
        if (playerElRef.current) playerElRef.current.style.opacity = "1";
        setRunId((n) => n + 1); // effect tears down and runLoop re-initialises everything
    };

    const bgClass = night ? "from-slate-900 to-indigo-800" : "from-sky-300 to-sky-100";

    return (
        <div
            ref={containerRef}
            className={`relative w-full h-full overflow-hidden bg-gradient-to-b ${bgClass} select-none touch-none`}
        >
            {/* night decorations */}
            {night && (
                <div className="absolute inset-0 pointer-events-none">
                    {stars.map((s, i) => (
                        <div
                            key={i}
                            className="absolute rounded-full bg-white"
                            style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s, opacity: s.o }}
                        />
                    ))}
                    <span className="absolute top-3 left-1/2 -translate-x-1/2 text-3xl opacity-90">🌙</span>
                </div>
            )}

            {/* HUD left: lives, score, invulnerability charge */}
            <div className="absolute top-0 left-0 px-4 py-3 z-20 text-white font-bold text-lg drop-shadow flex flex-col gap-1 pointer-events-none">
                <span>❤️ {lives}</span>
                <span>⭐ {score}</span>
                <div className="flex items-center gap-1.5">
                    <span className="text-base leading-none">🛡️</span>
                    <div className="w-20 h-2 rounded-full bg-black/30 overflow-hidden">
                        <div
                            ref={invulnFillRef}
                            className="h-full rounded-full"
                            style={{ width: "0%", backgroundColor: "#e2e8f0" }}
                        />
                    </div>
                </div>
            </div>

            {/* HUD right: combo hints */}
            <div className="absolute top-2 right-2 z-20 flex flex-col gap-1 pointer-events-none">
                {COMBOS.map((combo) => {
                    const flashing = comboView.flashId === combo.id;
                    let lit = 0;
                    if (flashing) lit = combo.fruits.length;
                    else if (combo.id === "straight") lit = comboView.straightIdx;
                    else if (comboView.runFruit === combo.fruits[0]) lit = comboView.runCount;

                    return (
                        <div
                            key={combo.id}
                            className={`flex items-center justify-between gap-2 rounded-lg px-2 py-0.5 bg-black/30 text-white transition-all duration-200 ${
                                flashing ? "bg-yellow-300 text-black scale-110 shadow-lg" : ""
                            }`}
                        >
                            <div className="flex">
                                {combo.fruits.map((fid, i) => (
                                    <span
                                        key={i}
                                        className="text-lg leading-none transition-all duration-200"
                                        style={{
                                            opacity: i < lit ? 1 : 0.3,
                                            filter: i < lit ? "none" : "grayscale(1)",
                                        }}
                                    >
                                        {glyph(fid)}
                                    </span>
                                ))}
                            </div>
                            <span className="text-xs font-bold tabular-nums">
                                {flashing ? `+${comboView.flashBonus}` : `×${combo.mult}`}
                            </span>
                        </div>
                    );
                })}
            </div>

            {/* falling objects layer */}
            <div className="absolute inset-0 z-10 pointer-events-none">
                {objectsRef.current.map((obj) => (
                    <div
                        key={obj.id}
                        ref={registerObjectEl(obj.id)}
                        className="absolute top-0 left-0 leading-none"
                        style={{ fontSize: obj.size, willChange: "transform" }}
                    >
                        {obj.emoji}
                    </div>
                ))}
            </div>

            {/* player */}
            <img
                ref={playerElRef}
                src={spriteSrc}
                alt={monsterName}
                className="absolute top-0 left-0 z-10 pointer-events-none"
                style={{
                    width: `${PLAYER_SIZE_RATIO * 100}%`,
                    willChange: "transform",
                    transformOrigin: "50% 100%", // scale from the feet
                }}
            />

            {/* controls */}
            {started && !gameOver && (
                <div className="absolute bottom-0 left-0 right-0 flex justify-between px-6 pb-6 z-20">
                    <button
                        onPointerDown={() => setDirection(-1)}
                        onPointerUp={() => setDirection(0)}
                        onPointerLeave={() => setDirection(0)}
                        className="w-16 h-16 rounded-full bg-black/50 text-white text-2xl flex items-center justify-center active:bg-black/70"
                        aria-label="move left"
                    >
                        ◀
                    </button>
                    <button
                        onPointerDown={() => setDirection(1)}
                        onPointerUp={() => setDirection(0)}
                        onPointerLeave={() => setDirection(0)}
                        className="w-16 h-16 rounded-full bg-black/50 text-white text-2xl flex items-center justify-center active:bg-black/70"
                        aria-label="move right"
                    >
                        ▶
                    </button>
                </div>
            )}

            {/* start screen */}
            {!started && (
                <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-5 bg-black/60 text-white">
                    <span className="text-2xl font-bold">{monsterName}</span>
                    <SegmentedToggle
                        label="Sky"
                        value={night}
                        onChange={setNight}
                        options={[
                            { value: false, label: "☀️ Day" },
                            { value: true, label: "🌙 Night" },
                        ]}
                    />
                    <SegmentedToggle
                        label="Fav meal"
                        value={people}
                        onChange={setPeople}
                        options={[
                            { value: false, label: "🍎 Fruits" },
                            { value: true, label: "🧑 People" },
                        ]}
                    />
                    <div className="flex gap-3 mt-2">
                        <button
                            onClick={() => setStarted(true)}
                            className="px-5 py-2 rounded-lg bg-white text-black font-bold uppercase text-sm"
                        >
                            Start
                        </button>
                        <button
                            onClick={onExit}
                            className="px-5 py-2 rounded-lg bg-transparent border border-white font-bold uppercase text-sm"
                        >
                            Back
                        </button>
                    </div>
                </div>
            )}

            {/* game over overlay */}
            {gameOver && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/70 text-white">
                    <span className="text-2xl font-bold uppercase">Game Over</span>
                    <span className="text-lg">Score: {score}</span>
                    <div className="flex gap-3 mt-2">
                        <button
                            onClick={handleRestart}
                            className="px-4 py-2 rounded-lg bg-white text-black font-bold uppercase text-sm"
                        >
                            Play again
                        </button>
                        <button
                            onClick={onExit}
                            className="px-4 py-2 rounded-lg bg-transparent border border-white font-bold uppercase text-sm"
                        >
                            Back
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
