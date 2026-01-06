import { Connection, PublicKey } from "@solana/web3.js";
import { useWallets } from "@privy-io/react-auth/solana";
import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useState, useMemo } from "react";

const ENDPOINT = "https://api.devnet.solana.com";

export default function Profile() {
    const { user, logout, connectWallet } = usePrivy();
    const { wallets } = useWallets();

    const email = user?.email?.address || "—";
    const [balance, setBalance] = useState(null);
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const [primaryWallet, setPrimaryWallet] = useState(null);

    const connection = useMemo(() => new Connection(ENDPOINT, "confirmed"), []);

    useEffect(() => {
        const stored = localStorage.getItem("primaryWallet");
        if (stored && wallets.find((w) => w.address === stored)) {
            setPrimaryWallet(stored);
        } else if (wallets[0]) {
            setPrimaryWallet(wallets[0].address);
            localStorage.setItem("primaryWallet", wallets[0].address);
        }
    }, [wallets]);

    useEffect(() => {
        if (!primaryWallet) return;
        const wallet = wallets.find((w) => w.address === primaryWallet);
        if (!wallet) return;

        const walletPubkey = new PublicKey(wallet.address);

        const fetchBalance = async () => {
            const lamports = await connection.getBalance(walletPubkey);
            setBalance(lamports / 1e9);
        };

        fetchBalance();
    }, [primaryWallet, wallets, connection]);

    const handleWalletChange = (e) => {
        const selected = e.target.value;
        setPrimaryWallet(selected);
        localStorage.setItem("primaryWallet", selected);
        setBalance(null);
    };

    return (
        <div className="flex-grow flex flex-col items-center p-3 text-xs">
            <div className="w-full max-w-xl rounded-2xl bg-black/60 text-white p-5 shadow-xl backdrop-blur-md border border-white/10">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className="text-lg font-semibold">Profile</h3>
                    </div>
                    <button
                        onClick={() => {
                            localStorage.removeItem("primaryWallet");
                            logout();
                        }}
                        className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 border border-white/20"
                    >
                        Log out
                    </button>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-3">
                    <div className="flex gap-2 items-center justify-between">
                        <div className="min-w-18 text-white/70">E-mail</div>
                        <div className="flex-1 truncate">{email}</div>
                    </div>
                    <div className="flex gap-2 items-center justify-between">
                        <div className="min-w-18 text-white/70">Wallet</div>
                        <div className="relative w-72 font-mono">
                            <div
                                className="flex items-center justify-between bg-black/30 text-white border border-white/20 rounded px-2 py-1 cursor-pointer"
                                onClick={() => setOpen(!open)}
                            >
                                {primaryWallet
                                    ? (() => {
                                          const w = wallets.find((w) => w.address === primaryWallet);
                                          if (!w) return "";
                                          const display = `${w.address.slice(0, 4)}…${w.address.slice(-4)}`;
                                          return (
                                              <span className="flex items-center gap-2 truncate">
                                                  <img
                                                      src={w.standardWallet.icon}
                                                      alt={w.standardWallet.name}
                                                      className="w-4 h-4"
                                                  />
                                                  {w.standardWallet.name} ({display})
                                              </span>
                                          );
                                      })()
                                    : "Select wallet"}
                            </div>

                            {open && (
                                <ul className="absolute left-0 right-0 mt-1 bg-black/90 border border-white/20 rounded max-h-60 overflow-auto z-10">
                                    {wallets.map((w) => {
                                        const addr = w.address;
                                        const display = `${addr.slice(0, 4)}…${addr.slice(-4)}`;
                                        return (
                                            <li
                                                key={addr}
                                                className="flex items-center gap-2 px-2 py-1 hover:bg-white/10 cursor-pointer"
                                                onClick={() => {
                                                    handleWalletChange({ target: { value: addr } });
                                                    setOpen(false);
                                                }}
                                            >
                                                <img
                                                    src={`${w.standardWallet.icon}`}
                                                    alt={w.standardWallet.name}
                                                    className="w-4 h-4"
                                                />
                                                {w.standardWallet.name} ({display})
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                        {primaryWallet && (
                            <button
                                className="text-xs text-white/60 hover:text-white transition"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(primaryWallet);
                                    setCopied(true);
                                }}
                                title="Copy address"
                            >
                                {copied ? "сopied!" : "copy"}
                            </button>
                        )}
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <div className="min-w-18 text-white/70">Balance</div>
                        <div className="flex-1 truncate font-mono">
                            {balance === null ? "fetching…" : `${balance.toFixed(4)} SOL`}
                        </div>
                    </div>
                    <button
                        className="w-full uppercase bg-purple-700 text-white rounded-md p-4 hover:bg-purple-600 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={connectWallet}
                    >
                        Connect wallet
                    </button>
                </div>
            </div>
        </div>
    );
}
