import api from "./api";

const MAX_SIDE = 1024;
const MAX_BYTES = 1024 * 1024;

export async function prepareSpecimen(blob) {
    let bitmap;
    try {
        bitmap = await createImageBitmap(blob);
    } catch {
        console.warn("[prepareSpecimen] createImageBitmap failed, sending original");
        return blob;
    }

    const { width, height } = bitmap;
    const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);

    const canvas = new OffscreenCanvas(w, h);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    let quality = 0.85;
    let result;
    do {
        result = await canvas.convertToBlob({ type: "image/jpeg", quality });
        quality -= 0.1;
    } while (result.size > MAX_BYTES && quality > 0.3);

    log("specimen:prepared", {
        original: `${Math.round(blob.size / 1024)}kb`,
        prepared: `${Math.round(result.size / 1024)}kb`,
        dims: `${w}x${h}`,
    });

    return result;
}

// ─── logger ───────────────────────────────────────────────────────────────────

const _entries = [];

export function log(event, data = {}, level = "info") {
    const entry = { t: Date.now(), event, level, ...data };
    _entries.push(entry);
    const icon = level === "error" ? "🔴" : level === "warn" ? "🟡" : "⚪";
    console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](`${icon} [${event}]`, data);
}

export function clearLog() {
    _entries.length = 0;
}

export function getLogEntries() {
    return [..._entries];
}

export async function flushLog(summary) {
    const errors = _entries.filter((e) => e.level === "error" || e.level === "warn");
    const meta = {
        total_events: _entries.length,
        duration_ms: _entries.length > 0 ? Date.now() - _entries[0].t : 0,
        ua: navigator.userAgent,
    };

    try {
        await api.debugLog({
            summary,
            ua: navigator.userAgent,
            entries: errors, // только ошибки и варнинги
            meta,
        });
    } catch (e) {
        console.warn("[logger] flush failed", e);
    }
}

const MAX_NETWORK_ERRORS = 6;

export function createPollSession() {
    let timerHandle = null;
    let cancelled = false;

    function cancel() {
        cancelled = true;
        clearTimeout(timerHandle);
    }

    function makePoll({ name, fetchFn, intervalMs, maxIntervalMs, totalTimeoutMs, onTick }) {
        return new Promise((resolve, reject) => {
            if (cancelled) return reject(new Error("Session cancelled"));

            const startTime = Date.now();
            let networkErrors = 0;

            const doPoll = async () => {
                if (cancelled) return;

                if (Date.now() - startTime > totalTimeoutMs) {
                    log(`${name}:timeout`, {}, "error");
                    flushLog(`${name} timeout`);
                    document.removeEventListener("visibilitychange", onVisible);
                    return reject(new Error(`${name} timeout`));
                }

                try {
                    const data = await fetchFn();
                    networkErrors = 0;

                    const outcome = onTick(data);
                    if (outcome === "resolve") {
                        document.removeEventListener("visibilitychange", onVisible);
                        return resolve(data);
                    }
                    if (outcome instanceof Error) {
                        flushLog(`${name} server failure`);
                        document.removeEventListener("visibilitychange", onVisible);
                        return reject(outcome);
                    }

                    timerHandle = setTimeout(doPoll, intervalMs);
                } catch (err) {
                    if (cancelled) return;
                    networkErrors++;
                    log(`${name}:networkError`, { attempt: networkErrors, msg: err.message }, "warn");

                    if (networkErrors >= MAX_NETWORK_ERRORS) {
                        flushLog(`${name} network errors ×${networkErrors}`);
                        document.removeEventListener("visibilitychange", onVisible);
                        return reject(new Error(`Network error ×${networkErrors}: ${err.message}`));
                    }

                    const delay = Math.min(intervalMs * Math.pow(2, networkErrors - 1), maxIntervalMs);
                    timerHandle = setTimeout(doPoll, delay);
                }
            };

            const onVisible = () => {
                if (document.visibilityState === "visible") {
                    log(`${name}:visibilityResume`);
                    clearTimeout(timerHandle);
                    doPoll();
                }
            };
            document.addEventListener("visibilitychange", onVisible);

            doPoll();
        });
    }

    function pollTask(taskId, { totalTimeoutMs = 180_000, onProgress } = {}) {
        log("pollTask:start", { taskId });
        return makePoll({
            name: `pollTask(${taskId})`,
            intervalMs: 2000,
            maxIntervalMs: 8000,
            totalTimeoutMs,
            fetchFn: () => api.getTaskStatus(taskId),
            onTick: (status) => {
                if (status.progress != null) onProgress?.(status.progress);
                log("pollTask:tick", { taskId, progress: status.progress, done: status.done });
                if (status.failed) return new Error(status.error || "Task failed");
                if (status.done) return "resolve";
            },
        }).then((status) => ({ result: status.result, nextTaskId: status.nextTaskId }));
    }

    function pollMintStatus(experimentId, { totalTimeoutMs = 90_000 } = {}) {
        log("pollMint:start", { experimentId });
        return makePoll({
            name: `pollMint(${experimentId})`,
            intervalMs: 2000,
            maxIntervalMs: 8000,
            totalTimeoutMs,
            fetchFn: () => api.getMintStatus(experimentId),
            onTick: (status) => {
                log("pollMint:tick", { experimentId, status: status.status });
                if (status.status === "confirmed") return "resolve";
                if (status.status === "failed") return new Error(status.error || "Mint failed");
            },
        });
    }

    return { pollTask, pollMintStatus, cancel };
}
