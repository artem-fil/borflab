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

        const { ClientSecret } = await api.createPayment({ productId: selectedProduct.id });
        const els = stripe.elements({ clientSecret: ClientSecret });
        setElements(els);
        setPayOpen(true);
        paymentMounted.current = false;
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

        await stripe.confirmPayment({
            elements,
            confirmParams: {
                return_url: window.location.href,
            },
        });
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
                            <span className="text-black text-lg font-bold">${Price}</span>
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
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                    <div className="bg-white rounded-lg p-4 w-[360px] relative">
                        <button
                            onClick={() => setPayOpen(false)}
                            className="absolute top-2 right-2 text-black/50 hover:text-black"
                        >
                            ✕
                        </button>
                        <h3 className="text-black font-bold mb-3">Buy {selectedProduct.Id}</h3>
                        <div id="stripe-payment" />
                        <button
                            onClick={confirmPay}
                            disabled={!paymentReady}
                            className="mt-4 w-full bg-black text-white py-2 rounded"
                        >
                            Pay ${selectedProduct.price}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
