import store from "./store.js";

const isProd = !document.location.hostname.endsWith("localhost");
const BASE_URL = isProd ? "https://borflab.com/api" : "http://127.0.0.1:8282";

async function request(endpoint, { method = "GET", body, timeout = 10000, signal, headers = {} } = {}) {
    const token = store.getToken();

    const controller = signal ? null : new AbortController();
    const id = controller ? setTimeout(() => controller.abort(), timeout) : null;
    const effectiveSignal = signal || controller?.signal;

    try {
        const res = await fetch(`${BASE_URL}${endpoint}`, {
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

    async mint(analyzeTaskId) {
        return request(`/progress/${analyzeTaskId}`);
    },
};
