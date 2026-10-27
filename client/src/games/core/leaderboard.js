// ЗАГЛУШКА лидерборда на localStorage. Интерфейс уже "серверный" (async),
// чтобы потом заменить тело функций на запросы к Go без правок в UI.
//
// ВАЖНО для настоящего бэкенда: клиентскому счёту верить нельзя. Сервер должен выдавать
// run-token при старте игры и проверять правдоподобие результата (orbs vs seconds
// при известной кривой сложности), иначе очки накрутят из консоли за минуту.

const KEY = "dodge:leaderboard:v1";
const MAX = 50;

const read = () => {
    try {
        return JSON.parse(localStorage.getItem(KEY)) || [];
    } catch {
        return [];
    }
};
const write = (list) => {
    try {
        localStorage.setItem(KEY, JSON.stringify(list));
    } catch {
        /* ignore */
    }
};

// больше орбов — выше; при равенстве — дольше продержался
const cmp = (a, b) => b.orbs - a.orbs || b.seconds - a.seconds;

/** @returns {Promise<{rank:number, record:boolean, top:Array}>} */
export async function submitScore({ name, id, orbs, seconds }) {
    const list = read();
    const entry = { name, id, orbs, seconds, at: Date.now() };
    const prevBest = [...list].sort(cmp)[0];
    const record = orbs > 0 && (!prevBest || cmp(entry, prevBest) < 0);
    list.push(entry);
    list.sort(cmp);
    const trimmed = list.slice(0, MAX);
    write(trimmed);
    const idx = trimmed.findIndex((e) => e.at === entry.at);
    return { rank: idx + 1, record, top: trimmed.slice(0, 5), at: entry.at };
}

/** @returns {Promise<Array>} */
export async function getLeaderboard(limit = 5) {
    return read().sort(cmp).slice(0, limit);
}
