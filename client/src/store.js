let identityToken = null;

const store = {
    setToken: (token) => (identityToken = token),
    clear: () => (identityToken = null),
    getToken: () => identityToken,
};

export default store;
