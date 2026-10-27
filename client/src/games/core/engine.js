// Игровой движок Dodge. Чистый JS, без React: canvas + requestAnimationFrame.
// React только создаёт движок, слушает колбэки и вызывает start()/move().
import { GAME, ORB_SPRITE as OS, SCENE } from "./config";

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const clamp01 = (v) => clamp(v, 0, 1);

// детерминированный PRNG (mulberry32)
function mulberry32(a) {
    return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export class DodgeEngine {
    /**
     * @param canvas    <canvas>
     * @param assets    { chamber, orb, idle, walk, hit } — загруженные HTMLImageElement (или null)
     * @param callbacks onMove(dir) onDodge(total) onHit() onGameOver({orbs, seconds})
     *                  onSecond(sec) onLevel(level)
     */
    constructor({ canvas, assets, callbacks = {} }) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.assets = assets;
        this.cb = callbacks;
        this.destroyed = false;
        this.clock = 0;
        this.last = 0;
        this.reset();
        this.loop = this.loop.bind(this);
        this.raf = requestAnimationFrame(this.loop);
    }

    // ---------- жизненный цикл ----------
    reset() {
        this.state = "idle"; // idle | playing | dying | over
        this.lane = 1; // логическая дорожка (по ней считаются столкновения)
        this.visLane = 1; // визуальная (плавно догоняет логическую)
        this.orbs = [];
        this.recent = []; // последние спавны: для защиты от "непроходимых" паттернов
        this.t = 0;
        this.dodged = 0;
        this.nextSpawn = GAME.startDelay;
        this.dyingT = 0;
        this.lastSecond = 0;
        this.level = 1;
        this.moves = [];
    }

    start(seed) {
        this.reset();
        this.rng = mulberry32(Number.isInteger(seed) ? seed >>> 0 : (Math.random() * 4294967296) >>> 0);
        this.state = "playing";
        this.cb.onLevel?.(1);
    }

    resize(cssW, cssH, dpr) {
        this.canvas.width = Math.max(1, Math.round(cssW * dpr));
        this.canvas.height = Math.max(1, Math.round(cssH * dpr));
    }

    destroy() {
        this.destroyed = true;
        cancelAnimationFrame(this.raf);
    }

    // ---------- ввод ----------
    /** dir: -1 влево, +1 вправо. Логическая дорожка меняется МГНОВЕННО. */
    move(dir) {
        if (this.state !== "playing") return false;
        const next = clamp(this.lane + dir, 0, 2);
        if (next === this.lane) return false;
        this.lane = next;
        if (this.moves.length < 20000) this.moves.push([Math.round(this.t * 1000), dir]);
        this.cb.onMove?.(dir);
        return true;
    }

    // ---------- сложность ----------
    difficulty() {
        const x = clamp01(this.t / GAME.rampSeconds);
        return 1 - (1 - x) * (1 - x); // быстрый старт, плавное насыщение
    }

    // ---------- главный цикл ----------
    loop(ts) {
        if (this.destroyed) return;
        const dt = this.last ? Math.min((ts - this.last) / 1000, GAME.maxDt) : 0;
        this.last = ts;
        this.update(dt);
        this.render();
        this.raf = requestAnimationFrame(this.loop);
    }

    update(dt) {
        this.clock += dt;
        this.visLane += (this.lane - this.visLane) * (1 - Math.exp(-GAME.moveEase * dt));
        if (Math.abs(this.lane - this.visLane) < 0.002) this.visLane = this.lane;

        if (this.state === "playing") this.updatePlaying(dt);
        else if (this.state === "dying") {
            this.dyingT += dt;
            if (this.dyingT >= GAME.dyingSeconds) {
                this.state = "over";
                this.cb.onGameOver?.({ orbs: this.dodged, seconds: this.t, moves: this.moves });
            }
        }
    }

    updatePlaying(dt) {
        this.t += dt;
        const sec = Math.floor(this.t);
        if (sec !== this.lastSecond) {
            this.lastSecond = sec;
            this.cb.onSecond?.(sec);
        }

        const d = this.difficulty();
        const level = Math.floor(d * 9) + 1;
        if (level !== this.level) {
            this.level = level;
            this.cb.onLevel?.(level);
        }

        // спавн
        this.nextSpawn -= dt;
        if (this.nextSpawn <= 0) {
            this.spawn(d);
            const base = lerp(GAME.interval[0], GAME.interval[1], d);
            this.nextSpawn = Math.max(GAME.minInterval, base * (1 + (this.rng() * 2 - 1) * GAME.jitter));
        }

        // орбы и столкновения
        for (const o of this.orbs) {
            o.age += dt;
            // Проверка не в момент пересечения, а на hitGrace позже:
            // кто успел уйти в последний момент — спасён.
            if (!o.checked && o.age >= o.T + GAME.hitGrace) {
                o.checked = true;
                if (o.lane === this.lane) {
                    this.die(o);
                    return;
                }
                this.dodged++;
                this.cb.onDodge?.(this.dodged);
            }
        }
        this.orbs = this.orbs.filter((o) => this.zOf(o) > SCENE.zGone);
    }

    die(orb) {
        orb.age = orb.T; // замораживаем орб ровно на игроке
        this.state = "dying";
        this.dyingT = 0;
        this.cb.onHit?.();
    }

    // ---------- спавн ----------
    recentLanes() {
        return new Set(this.recent.filter((r) => this.t - r.t < GAME.safeWindow).map((r) => r.lane));
    }

    addOrb(lane, d) {
        this.orbs.push({ lane, age: 0, T: lerp(GAME.travel[0], GAME.travel[1], d), checked: false });
        this.recent.push({ lane, t: this.t });
        if (this.recent.length > 6) this.recent.shift();
    }

    /**
     * Правило честности: за safeWindow секунд орбы не должны занять все три дорожки.
     * Поэтому если недавно уже были орбы в двух разных дорожках — новый идёт в одну из них.
     */
    spawn(d) {
        const rec = this.recentLanes();
        const pairChance = Math.max(0, d - GAME.pairStart) * (GAME.pairMaxChance / (1 - GAME.pairStart));

        if (this.rng() < pairChance) {
            let pair;
            if (rec.size === 0) {
                const a = (this.rng() * 3) | 0;
                const others = [0, 1, 2].filter((l) => l !== a);
                pair = [a, others[(this.rng() * 2) | 0]];
            } else if (rec.size === 1) {
                const a = [...rec][0];
                const others = [0, 1, 2].filter((l) => l !== a);
                pair = [a, others[(this.rng() * 2) | 0]];
            } else {
                pair = [...rec].slice(0, 2);
            }
            pair.forEach((l) => this.addOrb(l, d));
            return;
        }

        let cand = [0, 1, 2];
        if (rec.size >= 2) cand = cand.filter((l) => rec.has(l));
        this.addOrb(cand[(this.rng() * cand.length) | 0], d);
    }

    // ---------- геометрия ----------
    zOf(o) {
        return SCENE.zSpawn - (SCENE.zSpawn - SCENE.zNear) * (o.age / o.T);
    }

    /** x (0..1) центра дорожки (может быть дробной) на глубине f = 1/z */
    laneX(lane, f) {
        const L = SCENE.laneXAtFoot;
        const l = clamp(lane, 0, 2);
        const lo = Math.floor(l);
        const hi = Math.min(2, lo + 1);
        const xFoot = lerp(L[lo], L[hi], l - lo);
        return SCENE.vp.x + (xFoot - SCENE.vp.x) * f;
    }

    // ---------- рендер ----------
    render() {
        const { ctx, canvas } = this;
        const W = canvas.width;
        const H = canvas.height;
        ctx.clearRect(0, 0, W, H);
        const { chamber } = this.assets;
        if (chamber) ctx.drawImage(chamber, 0, 0, W, H);
        else {
            ctx.fillStyle = "#0b1218";
            ctx.fillRect(0, 0, W, H);
        }

        // от дальних к ближним; те, что дальше игрока — рисуем до него
        const sorted = [...this.orbs].sort((a, b) => this.zOf(b) - this.zOf(a));
        for (const o of sorted) if (this.zOf(o) > SCENE.zNear) this.drawOrb(o, W, H);
        this.drawPlayer(W, H);
        for (const o of sorted) if (this.zOf(o) <= SCENE.zNear) this.drawOrb(o, W, H);

        // красная вспышка при попадании
        if (this.state === "dying" || this.state === "over") {
            const k = this.state === "over" ? 0 : 1 - this.dyingT / GAME.dyingSeconds;
            if (k > 0) {
                ctx.fillStyle = `rgba(255,50,50,${0.35 * k})`;
                ctx.fillRect(0, 0, W, H);
            }
        }
    }

    drawOrb(o, W, H) {
        const ctx = this.ctx;
        const z = this.zOf(o);
        const f = SCENE.zNear / z;
        const x = this.laneX(o.lane, f) * W;
        const floorY = (SCENE.vp.y + (SCENE.footY - SCENE.vp.y) * f) * H;
        const cy = (SCENE.vp.y + (SCENE.footY - SCENE.vp.y - SCENE.elev) * f) * H;
        const D = SCENE.orbDiameter * W * f;
        const alpha = Math.min(clamp01((SCENE.zSpawn - z) / 0.5), clamp01((z - SCENE.zGone) / (0.85 - SCENE.zGone)));
        if (alpha <= 0) return;

        ctx.globalAlpha = alpha;

        // "кольцо" на полу — показывает дорожку и момент прилёта
        ctx.fillStyle = "rgba(70,180,255,0.22)";
        ctx.beginPath();
        ctx.ellipse(x, floorY, D * 0.55, D * 0.16, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(70,180,255,0.18)";
        ctx.beginPath();
        ctx.ellipse(x, floorY, D * 0.34, D * 0.09, 0, 0, Math.PI * 2);
        ctx.fill();

        const img = this.assets.orb;
        if (img) {
            const s = D / OS.d;
            const sw = img.naturalWidth;
            const sh = img.naturalHeight;
            const headTop = cy - (OS.cy - OS.splitY) * s;
            // шар
            ctx.drawImage(img, 0, OS.splitY, sw, sh - OS.splitY, x - OS.cx * s, headTop, sw * s, (sh - OS.splitY) * s);
            // луч от потолка: берём верхнюю часть спрайта и растягиваем до верха комнаты
            const beamH = headTop + 1;
            if (beamH > 2) {
                const srcH = Math.min(OS.splitY, beamH / s);
                ctx.drawImage(img, 0, OS.splitY - srcH, sw, srcH, x - OS.cx * s, 0, sw * s, beamH);
            }
        } else {
            ctx.fillStyle = "#4cf";
            ctx.beginPath();
            ctx.arc(x, cy, D / 2, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    drawPlayer(W, H) {
        const ctx = this.ctx;
        const dying = this.state === "dying" || this.state === "over";
        const dist = Math.abs(this.lane - this.visLane);
        const moving = !dying && dist > 0.04;
        const arc = moving ? Math.sin(Math.PI * clamp01(1 - dist)) * 0.035 * H : 0;

        let x = this.laneX(this.visLane, 1) * W;
        const foot = SCENE.footY * H;
        if (dying)
            x +=
                Math.sin(this.clock * 70) *
                W *
                0.006 *
                (this.state === "over" ? 0 : 1 - this.dyingT / GAME.dyingSeconds);

        const img = dying ? this.assets.hit : moving ? this.assets.walk : this.assets.idle;
        const h0 = SCENE.charHeight * H;
        const breathe = !dying && !moving ? 1 + Math.sin(this.clock * 5) * 0.02 : 1;
        const h = h0 * breathe;
        const w = img && img.naturalHeight ? h0 * (img.naturalWidth / img.naturalHeight) : h0;

        // тень (уменьшается в прыжке)
        const lift = arc / (0.035 * H || 1);
        ctx.fillStyle = `rgba(0,0,0,${0.38 - lift * 0.15})`;
        ctx.beginPath();
        ctx.ellipse(x, foot - 2, w * 0.3 * (1 - lift * 0.2), h0 * 0.05, 0, 0, Math.PI * 2);
        ctx.fill();

        if (img) ctx.drawImage(img, x - w / 2, foot - arc - h, w, h);
        else {
            ctx.fillStyle = "#f97316";
            ctx.fillRect(x - w / 2, foot - arc - h, w, h);
        }
    }
}
