import store from "./store.js";

const isProd = !document.location.hostname.endsWith("localhost");
const BASE_URL = isProd ? "https://borflab.com/api" : "http://127.0.0.1:8282";

async function request(endpoint, { method = "GET", body, timeout = 10000, signal, headers = {}, params = {} } = {}) {
    const token = store.getToken();

    const controller = signal ? null : new AbortController();
    const id = controller ? setTimeout(() => controller.abort(), timeout) : null;
    const effectiveSignal = signal || controller?.signal;

    const url = new URL(`${BASE_URL}${endpoint}`);

    if (params) {
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                url.searchParams.append(key, String(value));
            }
        });
    }

    try {
        const res = await fetch(url.toString(), {
            method,
            headers: {
                ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }),
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...headers,
            },
            ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}),
            signal: effectiveSignal,
        });

        if (controller) clearTimeout(id);

        if (!res.ok) {
            if (res.status === 401) {
                store.clear();
                window.location.href = "/signup";
            }

            let msg;
            try {
                const data = await res.json();
                msg = data.error || res.statusText;
            } catch {
                msg = res.statusText;
            }
            throw new Error(`API error ${res.status}: ${msg}`);
        }

        try {
            return await res.json();
        } catch {
            return {};
        }
    } catch (err) {
        if (controller) clearTimeout(id);
        if (err.name === "AbortError") throw new Error("Request aborted or timeout");
        throw err;
    }
}

export default {
    async syncUser(user) {
        return request("/users/sync", {
            method: "POST",
            body: {
                id: user.id,
                email: user.email?.address,
                wallet: user.wallet?.address,
            },
        });
    },

    async getStones() {
        return request("/stones");
    },

    async getMonsters({ page, limit, sort, order } = {}) {
        return request("/monsters", {
            params: {
                page: page ?? 1,
                limit: limit ?? 10,
                sort: sort ?? "created",
                order: order ?? "desc",
            },
        });
    },

    async analyze(formData, signal) {
        return request("/analyze", {
            method: "POST",
            body: formData,
            timeout: 60000,
            signal,
        });
    },

    async progress(taskId) {
        return request(`/progress/${taskId}`);
    },

    async prepareMonsterMint(id, body) {
        return request(`/prepare-monster-mint/${id}`, {
            method: "POST",
            body,
        });
    },

    async prepareStoneMint(body) {
        return request(`/prepare-stone-mint`, {
            method: "POST",
            body,
        });
    },

    checkMonsterMint(txid, { onMessage, onError } = {}) {
        const url = new URL(`${BASE_URL}/check-mint/${txid}`);

        const es = new EventSource(url.toString());

        es.onmessage = (event) => {
            try {
                console.log(event);
                console.log(event.data);
                const data = JSON.parse(event.data);
                onMessage(data);
            } catch (e) {
                console.error("SSE parse error", e);
            }
        };

        es.onerror = (err) => {
            console.error("SSE error", err);
            onError?.(err);
        };

        return {
            close: () => {
                es.close();
            },
        };
    },

    checkStoneMint(txid, { onMessage, onError } = {}) {
        const url = new URL(`${BASE_URL}/check-mint/${txid}`);

        const es = new EventSource(url.toString());

        es.onmessage = (event) => {
            try {
                console.log(event);
                console.log(event.data);
                const data = JSON.parse(event.data);
                onMessage(data);
            } catch (e) {
                console.error("SSE parse error", e);
            }
        };

        es.onerror = (err) => {
            console.error("SSE error", err);
            onError?.(err);
        };

        return {
            close: () => {
                es.close();
            },
        };
    },
};
