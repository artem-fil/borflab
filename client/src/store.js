let identityToken = null;
let borfId = null;

const store = {
    setToken: (token) => (identityToken = token),
    clear: () => (identityToken = null),
    getToken: () => identityToken,

    setBorfId: (id) => (borfId = id),
    clearBorfId: () => (borfId = null),
    getBorfId: () => borfId,
};

export default store;
