let identityToken = null;
let borfId = null;
let debug = false;

const store = {
    setToken: (token) => (identityToken = token),
    clear: () => (identityToken = null),
    getToken: () => identityToken,

    setBorfId: (id) => (borfId = id),
    clearBorfId: () => (borfId = null),
    getBorfId: () => borfId,

    setDebug: (v) => (debug = v),
    getDebug: () => debug,
};

export default store;
