import store from "./store.js";

const isProd = !document.location.hostname.endsWith("localhost");
const BASE_URL = isProd ? "https://borflab.com" : "http://127.0.0.1:8282";

async function request(endpoint, options = {}) {
    const { method = "GET", body, timeout = 10000, signal: externalSignal, headers = {}, params = {} } = options;
    const token = store.getToken();

    const controller = new AbortController();
    const { signal } = controller;

    const timeoutId = setTimeout(() => {
        controller.abort(new Error("Timeout"));
    }, timeout);

    if (externalSignal) {
        if (externalSignal.aborted) {
            controller.abort(externalSignal.reason);
        } else {
            externalSignal.addEventListener("abort", () => controller.abort(externalSignal.reason), { once: true });
        }
    }

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
            signal,
        });

        if (!res.ok) {
            if (res.status === 401) {
                store.clear();
                window.location.href = "/signup";
            }

            const data = await res.json().catch(() => ({}));
            const msg = data.error || data.message || res.statusText;

            throw new Error(`API Error ${res.status}: ${msg}`);
        }

        const contentType = res.headers.get("content-type");
        if (res.status === 204 || !contentType?.includes("application/json")) {
            return null;
        }

        return await res.json();
    } catch (err) {
        if (err.name === "AbortError") {
            const abortError = new Error(err.message === "Timeout" ? "Request timeout" : "Request aborted");
            abortError.aborted = true;
            throw abortError;
        }
        throw err;
    } finally {
        clearTimeout(timeoutId);
    }
}

export default {
    async syncUser(user) {
        return request("/api/users/sync", {
            method: "POST",
            body: {
                id: user.id,
                email: user.email?.address,
                wallet: user.wallet?.address,
            },
        });
    },

    async getStones() {
        return request("/api/stones");
    },

    async getMonsters({ page, limit, sort, order } = {}) {
        return request("/api/monsters", {
            params: {
                page: page ?? 1,
                limit: limit ?? 10,
                sort: sort ?? "created",
                order: order ?? "desc",
            },
        });
    },

    async analyze(formData) {
        return request("/api/analyze", {
            method: "POST",
            body: formData,
        });
    },

    async prepareMonsterMint(id, body) {
        return request(`/api/prepare-monster-mint/${id}`, {
            method: "POST",
            body,
        });
    },

    async prepareStoneMint(body) {
        return request(`/api/prepare-stone-mint`, {
            method: "POST",
            body,
        });
    },

    async swapMonster(body) {
        return request(`/api/prepare-monster-swap`, {
            method: "POST",
            body,
        });
    },

    async createPayment(body) {
        return request(`/api/create-payment/`, {
            method: "POST",
            body,
        });
    },

    async getProducts() {
        return request(`/api/products/`);
    },

    subscribeSSE(key, { onEvent, onError } = {}) {
        const url = new URL(`${BASE_URL}/sse/subscribe/${key}`);
        const es = new EventSource(url.toString());

        const handler = (event) => {
            try {
                const data = event.data ? JSON.parse(event.data) : null;
                onEvent?.(event.type, data);
            } catch (e) {
                console.error("SSE parse error", e);
            }
        };

        es.addEventListener("progress", handler);
        es.addEventListener("confirmed", handler);
        es.addEventListener("failed", handler);
        es.addEventListener("done", handler);

        es.onerror = (err) => {
            console.error("SSE error", err);
            onError?.(err);
            es.close();
        };

        return {
            close: () => es.close(),
        };
    },
};
