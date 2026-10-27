// Мини-звук на Web Audio API (без Howler). Низкая задержка, работает на iOS после первого тапа.
import alarm from "../../assets/sounds/alarm.ogg";
import blow from "../../assets/sounds/blow.ogg";
import click from "../../assets/sounds/click.ogg";
import eat from "../../assets/sounds/eat.ogg";
import mint from "../../assets/sounds/mint.ogg";
import track1 from "../../assets/sounds/track1.mp3";

const FILES = { click, eat, blow, alarm, mint, music: track1 };
const MUTE_KEY = "dodge:muted";

let ctx = null;
let master = null;
let musicGain = null;
let musicSrc = null;
let wantMusic = false;
const buffers = {};
const lastPlayed = {};

let muted = false;
try {
    muted = localStorage.getItem(MUTE_KEY) === "1";
} catch {
    /* приватный режим */
}

async function load(name) {
    try {
        const res = await fetch(FILES[name]);
        const arr = await res.arrayBuffer();
        buffers[name] = await ctx.decodeAudioData(arr);
        if (name === "music" && wantMusic) audio.startMusic();
    } catch (e) {
        // например, старый iOS не умеет .ogg — игра просто будет без этого звука
        console.warn(`[dodge audio] cannot load "${name}"`, e);
    }
}

function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);
    Object.keys(FILES).forEach(load);
    return ctx;
}

export const audio = {
    /** вызвать при монтировании: создаёт контекст и грузит файлы */
    preload() {
        ensure();
    },

    /** вызывать из обработчика тапа/клика — iOS иначе не даст играть */
    unlock() {
        const c = ensure();
        if (c && c.state !== "running") c.resume().catch(() => {});
    },

    play(name, { volume = 1, rate = 1, minGap = 0 } = {}) {
        if (!ctx || !buffers[name]) return;
        const now = ctx.currentTime;
        if (minGap && lastPlayed[name] && now - lastPlayed[name] < minGap) return;
        lastPlayed[name] = now;
        const src = ctx.createBufferSource();
        src.buffer = buffers[name];
        src.playbackRate.value = rate;
        const g = ctx.createGain();
        g.gain.value = volume;
        src.connect(g).connect(master);
        src.start();
    },

    startMusic(volume = 0.35) {
        wantMusic = true;
        if (!ctx || musicSrc) return;
        if (!buffers.music) return; // догрузится — стартанёт сам
        musicGain = ctx.createGain();
        musicGain.gain.setValueAtTime(0, ctx.currentTime);
        musicGain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.6);
        musicSrc = ctx.createBufferSource();
        musicSrc.buffer = buffers.music;
        musicSrc.loop = true;
        musicSrc.connect(musicGain).connect(master);
        musicSrc.start();
    },

    stopMusic(fade = 0.3) {
        wantMusic = false;
        if (!ctx || !musicSrc) return;
        const src = musicSrc;
        const g = musicGain;
        musicSrc = null;
        musicGain = null;
        g.gain.cancelScheduledValues(ctx.currentTime);
        g.gain.setValueAtTime(g.gain.value, ctx.currentTime);
        g.gain.linearRampToValueAtTime(0, ctx.currentTime + fade);
        setTimeout(() => {
            try {
                src.stop();
            } catch {
                /* уже остановлен */
            }
        }, fade * 1000 + 50);
    },

    setMuted(v) {
        muted = v;
        try {
            localStorage.setItem(MUTE_KEY, v ? "1" : "0");
        } catch {
            /* ignore */
        }
        if (master) master.gain.setTargetAtTime(v ? 0 : 1, ctx.currentTime, 0.02);
    },

    isMuted: () => muted,
};
