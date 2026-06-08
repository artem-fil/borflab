import Button from "@components/Button";
import { loadStripe } from "@stripe/stripe-js";
import { useEffect, useRef, useState } from "react";
import api from "../api";
import { PRODUCTS } from "../config";

const publicKey =
    "pk_test_51QJAj6HH9n10mVPrjGiHWzHdk8Ya4yItMhxXC1i5S24k8bVDjBuGtQQnY9vWkWWo7bTlWeOiPqe0kpLiJZIQGZBA00dOKBGj51";

const PACK_STAGE = {
    IDLE: "idle", // пак доставлен, ждём тапа
    SHAKING: "shaking", // трясётся
    OPENING: "opening", // вспышка
    DONE: "done", // камни показаны
};

import { Link } from "react-router-dom";
import { STONES } from "../config.js";

export default function Shop() {
    const [products, setProducts] = useState([]);
    const [index, setIndex] = useState(0);
    const [stripe, setStripe] = useState(null);
    const [checkout, setCheckout] = useState(null);
    const [payOpen, setPayOpen] = useState(false);
    const [paymentReady, setPaymentReady] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const sseRef = useRef(null);
    const sseTimeoutRef = useRef(null);
    const [paymentSuccess, setPaymentSuccess] = useState(false);
    const [paymentError, setPaymentError] = useState(false);
    const [orderId, setOrderId] = useState(null);
    const [purchase, setPurchase] = useState(null);
    const [stones, setStones] = useState(null);
    const [packStage, setPackStage] = useState(PACK_STAGE.IDLE);
    const paymentMounted = useRef(false);
    const selectedProduct = products[index];

    useEffect(() => {
        let alive = true;
        (async () => {
            const { Products } = await api.getProducts();
            if (!alive) return;
            setProducts(Products);
            const stripeInstance = await loadStripe(publicKey);
            if (!alive) return;
            setStripe(stripeInstance);
        })();
        return () => {
            alive = false;
        };
    }, []);

    const prev = () => setIndex((i) => (i - 1 + products.length) % products.length);
    const next = () => setIndex((i) => (i + 1) % products.length);

    useEffect(() => {
        if (payOpen && checkout && !paymentMounted.current) {
            const paymentElement = checkout.createPaymentElement();
            paymentElement.mount("#stripe-payment");
            paymentMounted.current = true;
            setPaymentReady(true);
        }
    }, [payOpen, checkout]);

    const confirmPay = async () => {
        if (!checkout) return;
        setLoading(true);

        const loadActionsResult = await checkout.loadActions();
        if (loadActionsResult.type !== "success") {
            setError("Failed to load payment actions");
            setLoading(false);
            return;
        }

        const { actions } = loadActionsResult;
        const { error } = await actions.confirm({ redirect: "if_required" });
        setLoading(false);

        if (error) {
            setError(error.message);
            return;
        }

        sseTimeoutRef.current = setTimeout(() => {
            sseRef.current?.close();
            sseRef.current = null;
        }, 60000);

        sseRef.current = api.subscribeSSE(orderId, {
            onEvent: (event, data) => {
                if (event === "confirmed") {
                    setPurchase(data.purchase);
                    setPaymentSuccess(true);
                    setPackStage(PACK_STAGE.IDLE);
                    cleanupSubscribe();
                }
                if (event === "failed") {
                    setPaymentError(true);
                    cleanupSubscribe();
                }
            },
            onError: () => console.warn("SSE disconnected, retrying..."),
        });
    };

    const openPack = async (purchaseId) => {
        // Стадия 1: трясётся
        setPackStage(PACK_STAGE.SHAKING);

        await new Promise((r) => setTimeout(r, 800));

        // Стадия 2: вспышка + запрос
        setPackStage(PACK_STAGE.OPENING);

        try {
            const { Purchase } = await api.openPurchase(purchaseId);
            await new Promise((r) => setTimeout(r, 400)); // дать вспышке сыграть
            setStones(Purchase.Payload);
            setPackStage(PACK_STAGE.DONE);
        } catch (e) {
            setError(e);
            setPackStage(PACK_STAGE.IDLE);
        }
    };

    function cleanupSubscribe() {
        clearTimeout(sseTimeoutRef.current);
        sseTimeoutRef.current = null;
        sseRef.current?.close();
        sseRef.current = null;
    }

    const handleBuyProduct = async (product) => {
        if (!stripe || !product) return;
        setLoading(true);
        setError(null);
        setPaymentSuccess(false);
        setPaymentError(false);
        setStones(null);
        setPurchase(null);
        setPackStage(PACK_STAGE.IDLE);
        paymentMounted.current = false;
        setCheckout(null);
        setPaymentReady(false);
        try {
            setPayOpen(true);
            const { ClientSecret, OrderId } = await api.createPayment({ productId: product.Id });
            setOrderId(OrderId);
            const co = await stripe.initCheckout({ clientSecret: ClientSecret });
            setCheckout(co);
        } catch (e) {
            setError(e);
        } finally {
            setLoading(false);
        }
    };

    const handleBuy = () => handleBuyProduct(selectedProduct);

    const closeModal = () => {
        setPayOpen(false);
        setPaymentSuccess(false);
        setPaymentError(false);
        setStones(null);
        setPurchase(null);
        setPackStage(PACK_STAGE.IDLE);
        setError(null);
    };

    return (
        <div className="flex-grow flex flex-col items-center text-white py-2 relative">
            {/* HEADER */}
            <div className="w-full flex justify-between px-6 py-2">
                <h2 className="font-bold text-xl">BORF shop</h2>
            </div>

            {/* SLIDER */}
            <div className="w-full bg-gray-100 flex-grow flex items-center justify-center overflow-hidden">
                <div
                    className="flex transition-transform duration-300 ease-out"
                    style={{
                        transform: `translateX(-${index * 100}%)`,
                        width: `${products.length * 100}%`,
                    }}
                >
                    {products.map(({ Id, Price }) => (
                        <div key={Id} className="w-full flex-shrink-0 flex flex-col items-center gap-2">
                            <img src={PRODUCTS[Id]} alt="" />
                            <span className="text-black text-lg font-bold">{Id}</span>
                            <span className="text-black text-lg font-bold">${(Price / 100).toFixed(2)}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* CONTROLS */}
            <div className="py-2 flex flex-col items-center gap-2">
                <div className="flex gap-4 text-lg items-center">
                    <button onClick={prev}>👈</button>
                    <div className="flex gap-1">
                        {products.map((_, i) => (
                            <div
                                key={i}
                                className={`w-2 h-2 rounded-full ${i === index ? "bg-white" : "bg-white/30"}`}
                            />
                        ))}
                    </div>
                    <button onClick={next}>👉</button>
                </div>
                <Button label="buy" onClick={handleBuy} disabled={!stripe || !selectedProduct} />
            </div>

            {/* MODAL */}
            {payOpen && selectedProduct && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl p-4 w-80 relative shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
                        <button
                            onClick={closeModal}
                            className="absolute top-4 right-4 text-black/30 hover:text-black z-10"
                        >
                            ✕
                        </button>

                        {paymentSuccess ? (
                            <div className="py-4 text-gray-800 flex flex-col gap-3 items-center text-center">
                                {packStage === PACK_STAGE.DONE && stones ? (
                                    <>
                                        <div className="text-2xl font-black">💎 YEAH!</div>
                                        <p className="text-sm text-gray-500">{purchase.Product} opened</p>
                                        <div className="w-full grid grid-cols-3 gap-3 mt-2">
                                            {Object.entries(stones).map(([stone, amount]) => (
                                                <div
                                                    key={stone}
                                                    className="flex flex-col gap-1 items-center animate-in fade-in zoom-in duration-500"
                                                    style={{ animationDelay: `${Math.random() * 300}ms` }}
                                                >
                                                    <img
                                                        src={STONES[stone].image}
                                                        alt={stone}
                                                        className="w-14 h-14 object-contain drop-shadow-lg"
                                                    />
                                                    <span className="text-xs font-bold text-gray-700">{stone}</span>
                                                    <span className="text-xs text-gray-400">×{amount}</span>
                                                </div>
                                            ))}
                                        </div>

                                        {/* КНОПКИ */}
                                        <div className="w-full flex flex-col gap-2 mt-2">
                                            <Link
                                                to="/lab"
                                                className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 rounded-xl transition-colors text-center"
                                            >
                                                GO BORF
                                            </Link>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => {
                                                        closeModal();
                                                        setTimeout(() => {
                                                            const pack10idx = products.findIndex(
                                                                (p) => p.Id === "pack10"
                                                            );
                                                            if (pack10idx !== -1) {
                                                                setIndex(pack10idx);
                                                                handleBuyProduct(products[pack10idx]);
                                                            }
                                                        }, 100);
                                                    }}
                                                    className="flex-1 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-bold py-2 rounded-xl text-sm transition-colors"
                                                >
                                                    +pack10
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        closeModal();
                                                        setTimeout(() => {
                                                            const pack25idx = products.findIndex(
                                                                (p) => p.Id === "pack25"
                                                            );
                                                            if (pack25idx !== -1) {
                                                                setIndex(pack25idx);
                                                                handleBuyProduct(products[pack25idx]);
                                                            }
                                                        }, 100);
                                                    }}
                                                    className="flex-1 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-bold py-2 rounded-xl text-sm transition-colors"
                                                >
                                                    +pack25
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="text-xl font-black">🎉 Delivered!</div>
                                        <p className="text-sm text-gray-500">{purchase?.Product}</p>
                                        <div
                                            className="relative cursor-pointer select-none"
                                            onClick={() => packStage === PACK_STAGE.IDLE && openPack(purchase.Id)}
                                        >
                                            {packStage === PACK_STAGE.OPENING && (
                                                <div className="absolute inset-0 rounded-xl bg-white animate-ping opacity-75 z-10" />
                                            )}
                                            <img
                                                src={PRODUCTS[purchase.Product]}
                                                alt=""
                                                className={`h-36 object-contain transition-transform
                                        ${packStage === PACK_STAGE.IDLE ? "hover:scale-105 active:scale-95" : ""}
                                        ${packStage === PACK_STAGE.SHAKING ? "animate-[shake_0.15s_ease-in-out_infinite]" : ""}
                                        ${packStage === PACK_STAGE.OPENING ? "scale-125 opacity-0 transition-all duration-300" : ""}
                                    `}
                                            />
                                        </div>
                                        {packStage === PACK_STAGE.IDLE && (
                                            <p className="text-sm text-gray-400 animate-pulse">tap to open</p>
                                        )}
                                        {packStage === PACK_STAGE.SHAKING && (
                                            <p className="text-sm text-gray-400">opening...</p>
                                        )}
                                    </>
                                )}
                            </div>
                        ) : paymentError ? (
                            <div className="py-8 flex flex-col items-center text-center">
                                <div className="text-6xl mb-4">💀</div>
                                <h3 className="text-red-500 text-2xl font-black mb-2">NO WAY...</h3>
                                <p className="text-gray-600">The bank says: "Not today".</p>
                                <button
                                    onClick={() => setPaymentError(false)}
                                    className="mt-6 w-full bg-black text-white font-bold py-3 rounded-xl"
                                >
                                    Try again
                                </button>
                            </div>
                        ) : (
                            <div className="animate-in fade-in duration-300">
                                <h3 className="text-black font-black text-xl mb-4 uppercase tracking-tight">
                                    Payment for {selectedProduct.Id}
                                </h3>
                                <div id="stripe-payment" className="min-h-[250px]" />
                                <button
                                    onClick={confirmPay}
                                    disabled={!paymentReady || loading}
                                    className={`mt-6 w-full flex justify-center items-center gap-2 text-white font-bold py-4 rounded-xl shadow-lg transition-all ${
                                        loading
                                            ? "bg-gray-400"
                                            : "bg-gradient-to-r from-blue-600 to-indigo-600 active:scale-95"
                                    }`}
                                >
                                    {loading ? (
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        `PAY ${(selectedProduct.Price / 100).toFixed(2)} USD`
                                    )}
                                </button>
                                {error && (
                                    <div className="mt-4 p-3 bg-red-50 text-red-500 rounded-lg text-sm text-center font-medium border border-red-100">
                                        {error.message || error}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            <style>{`
                @keyframes shake {
                    0%, 100% { transform: translateX(0) rotate(0deg); }
                    20% { transform: translateX(-6px) rotate(-3deg); }
                    40% { transform: translateX(6px) rotate(3deg); }
                    60% { transform: translateX(-4px) rotate(-2deg); }
                    80% { transform: translateX(4px) rotate(2deg); }
                }
            `}</style>
        </div>
    );
}
