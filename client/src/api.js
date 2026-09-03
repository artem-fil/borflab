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
        const res = await Promise.race([
            fetch(url.toString(), {
                method,
                cache: method === "GET" ? "no-store" : "default",
                headers: {
                    ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }),
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    ...headers,
                },
                ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}),
                signal,
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), timeout)),
        ]);

        if (!res.ok) {
            if (res.status === 401) {
                store.clear();
                store.clearBorfId();
                window.location.href = "/signup";
            }

            const data = await res.json().catch(() => ({}));
            const msg = data.error || data.message || res.statusText;

            const err = new Error(`API Error ${res.status}: ${msg}`);
            if (res.status === 404) err.notFound = true;
            throw err;
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
                _: Date.now(),
            },

            cache: "no-store",
            headers: {
                "Cache-Control": "no-cache, no-store, must-revalidate",
                Pragma: "no-cache",
                Expires: "0",
            },
        });
    },

    async getSwapomat({ page, limit, sort, order } = {}) {
        return request("/api/swapomat", {
            params: {
                page: page ?? 1,
                limit: limit ?? 10,
                sort: sort ?? "created",
                order: order ?? "desc",
            },
        });
    },

    async getMonster(id) {
        return request(`/api/monsters/${id}`);
    },

    async analyze(formData) {
        return request("/api/analyze", {
            method: "POST",
            body: formData,
            timeout: 40_000,
        });
    },

    async getTaskStatus(taskId) {
        return request(`/api/task/${taskId}`, {
            timeout: 10000,
        });
    },

    async getMintStatus(experimentId) {
        return request(`/api/mint/${experimentId}`, {
            timeout: 10000,
        });
    },

    async getSwapStatus(signature) {
        return request(`/api/swap/${signature}`, {
            timeout: 5000,
        });
    },

    async mintMonster(id, body) {
        return request(`/api/monsters/${id}`, {
            method: "POST",
            body,
            timeout: 40_000, // несколько Solana RPC вызовов последовательно
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

    async getCounter() {
        return request(`/api/counter/`);
    },

    async openPurchase(purchaseId) {
        return request(`/api/purchases/${purchaseId}`, {
            method: "PUT",
        });
    },

    async debugLog(payload) {
        return request("/api/debug", {
            method: "POST",
            body: payload,
            timeout: 8_000,
        });
    },

    subscribeSSE(key, { onEvent, onError } = {}) {
        const url = new URL(`${BASE_URL}/sse/subscribe/${key}`);
        const es = new EventSource(url.toString());

        const handler = (event) => {
            try {
                if (!event.data) return;

                const data = JSON.parse(event.data);
                onEvent?.(event.type, data);
            } catch (e) {
                console.error("SSE parse error", e, event.data);
            }
        };

        es.addEventListener("progress", handler);
        es.addEventListener("confirmed", handler);
        es.addEventListener("failed", handler);
        es.addEventListener("done", handler);

        es.onerror = (err) => {
            if (es.readyState === EventSource.CLOSED) {
                console.error("SSE Connection closed permanently", err);
                onError?.(err);
            }
        };

        return {
            close: () => {
                console.log("SSE manually closed");
                es.close();
            },
        };
    },

    // dashboard

    getPrompts() {
        return request("/dashboard/prompts");
    },

    saveActivePrompt(name, payload) {
        return request("/dashboard/prompts/active", {
            method: "PUT",
            body: { name, payload },
        });
    },

    saveSlot(n, name, payload) {
        return request(`/dashboard/prompts/${n}`, {
            method: "PUT",
            body: { name, payload },
        });
    },

    activateSlot(n) {
        return request(`/dashboard/prompts/${n}/activate`, {
            method: "POST",
        });
    },

    clearSlot(n) {
        return request(`/dashboard/prompts/slots/${n}`, {
            method: "DELETE",
        });
    },

    generate(formData) {
        return request("/dashboard/generate", {
            method: "POST",
            body: formData,
            timeout: 30000,
        });
    },

    async getExperiments(page = 1, filters = {}) {
        const {
            limit = 24,
            onlyTest = true,
            stones,
            biomes,
            qualities,
            rarities,
            sort = "created",
            order = "desc",
        } = filters;
        return request("/dashboard/experiments", {
            params: {
                page,
                limit,
                sort,
                order,
                only_test: onlyTest,
                ...(stones?.length ? { stones: stones.join(",") } : {}),
                ...(biomes?.length ? { biomes: biomes.join(",") } : {}),
                ...(qualities?.length ? { qualities: qualities.join(",") } : {}),
                ...(rarities?.length ? { rarities: rarities.join(",") } : {}),
            },
        });
    },
};
