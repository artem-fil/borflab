import { useEffect, useRef, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import Button from "@components/Button";
import api from "../api";
import { PRODUCTS } from "../config";

const publicKey =
    "pk_test_51QJAj6HH9n10mVPrjGiHWzHdk8Ya4yItMhxXC1i5S24k8bVDjBuGtQQnY9vWkWWo7bTlWeOiPqe0kpLiJZIQGZBA00dOKBGj51";

export default function Shop() {
    const [products, setProducts] = useState([]);
    const [index, setIndex] = useState(0);

    const [stripe, setStripe] = useState(null);
    const [elements, setElements] = useState(null);
    const [payOpen, setPayOpen] = useState(false);
    const [paymentReady, setPaymentReady] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const sseRef = useRef(null);
    const sseTimeoutRef = useRef(null);
    const sseFinishedRef = useRef(false);
    const [paymentSuccess, setPaymentSuccess] = useState(false);
    const [paymentError, setPaymentError] = useState(false);
    const [orderId, setOrderId] = useState(null);

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

    const prev = () => {
        if (!products.length) return;
        setIndex((i) => (i - 1 + products.length) % products.length);
    };

    const next = () => {
        if (!products.length) return;
        setIndex((i) => (i + 1) % products.length);
    };

    const handleBuy = async () => {
        if (!stripe || !selectedProduct) return;

        setLoading(true);
        setError(null);

        try {
            setPayOpen(true);
            const { ClientSecret, OrderId } = await api.createPayment({ productId: selectedProduct.Id });
            setOrderId(OrderId);
            const els = stripe.elements({ clientSecret: ClientSecret });
            setElements(els);
            paymentMounted.current = false;
        } catch (e) {
            console.error(e);
            setError(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (payOpen && elements && !paymentMounted.current) {
            const el = elements.create("payment");
            el.mount("#stripe-payment");
            paymentMounted.current = true;
            setPaymentReady(true);
        }
    }, [payOpen, elements]);

    const confirmPay = async () => {
        if (!stripe || !elements) return;

        const result = await stripe.confirmPayment({
            elements,
            redirect: "if_required",
            confirmParams: {
                return_url: window.location.href,
            },
        });

        if (result.error) {
            setError(result.error.message);
            setLoading(false);
        } else {
            console.log("Payment initiated, waiting for SSE...");
        }

        sseTimeoutRef.current = setTimeout(() => {
            console.warn("⏰ Mint SSE timeout");
            sseRef.current?.close();
            sseRef.current = null;
        }, 60000);

        sseRef.current = api.subscribeSSE(orderId, {
            onEvent: (event, data) => {
                if (event === "confirmed") {
                    setPaymentSuccess(true);
                    cleanupMint();
                    console.log("🎉 Mint successful!", data);
                }

                if (event === "failed") {
                    setPaymentError(true);
                    cleanupMint();
                    console.error("❌ Mint failed", data);
                }
            },

            onError: () => {
                console.warn("⚠️ SSE temporarily disconnected, retrying...");
            },
        });
    };

    function cleanupMint() {
        clearTimeout(sseTimeoutRef.current);
        sseTimeoutRef.current = null;
        sseRef.current?.close();
        sseRef.current = null;
        sseFinishedRef.current = true;
    }

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
                    <div className="bg-white rounded-2xl p-6 w-[380px] relative shadow-2xl overflow-hidden">
                        <button
                            onClick={() => {
                                setPayOpen(false);
                                setPaymentSuccess(false);
                                setPaymentError(false);
                            }}
                            className="absolute top-4 right-4 text-black/30 hover:text-black z-10"
                        >
                            ✕
                        </button>
                        {paymentSuccess ? (
                            <div className="py-8 flex flex-col items-center text-center animate-in fade-in zoom-in duration-300">
                                <div className="text-6xl mb-4">🎉</div>
                                <h3 className="text-black text-2xl font-black mb-2">YEAH!</h3>
                                <p className="text-gray-600">
                                    <b>{selectedProduct.Id}</b> has been delivered.
                                </p>
                                <button
                                    onClick={() => setPayOpen(false)}
                                    className="mt-6 w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 rounded-xl transition-colors"
                                >
                                    Open!
                                </button>
                            </div>
                        ) : paymentError ? (
                            <div className="py-8 flex flex-col items-center text-center animate-in fade-in zoom-in duration-300">
                                <div className="text-6xl mb-4">💀</div>
                                <h3 className="text-red-500 text-2xl font-black mb-2">OH SHIT...</h3>
                                <p className="text-gray-600">
                                    Something went wrong with the payment. The bank says: "Not today, bro".
                                </p>
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
        </div>
    );
}
