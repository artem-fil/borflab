import { Connection, Transaction } from "@solana/web3.js";

import { useWallets, useSignTransaction } from "@privy-io/react-auth/solana";

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";

import Stone from "../components/Stone";
import Button from "../components/Button";

import storageImage from "../assets/storage.jpg";
import agateImage from "../assets/agate.png";
import jadeImage from "../assets/jade.png";
import topazImage from "../assets/topaz.png";
import quartzImage from "../assets/quartz.png";
import sapphireImage from "../assets/sapphire.png";
import amazoniteImage from "../assets/amazonite.png";
import rubyImage from "../assets/ruby.png";

import api from "../api";

const ENDPOINT = "https://api.devnet.solana.com";

export default function Storage() {
    const { wallets } = useWallets();
    const { signTransaction } = useSignTransaction();
    const solanaWallet = wallets[0];

    const [stoneDialog, setStoneDialog] = useState(false);
    const [availableStones, setAvailableStones] = useState({});
    const [loading, setLoading] = useState(true);
    const [minting, setIsMinting] = useState(false);
    const [mintSuccess, setMintSuccess] = useState(false);
    const [mintError, setMintError] = useState(false);
    const mintSSERef = useRef(null);
    const mintTimeoutRef = useRef(null);
    const mintFinishedRef = useRef(false);

    useEffect(() => {
        if (solanaWallet?.address) {
            loadStonesData();
        }
    }, [solanaWallet?.address]);

    async function loadStonesData() {
        setLoading(true);
        try {
            const stones = await api.getStones();
            const s = {};

            for (let stone of stones) {
                s[stone.Type] = stone.SparkCount;
            }

            setAvailableStones(s);
        } catch (error) {
            console.error("Error loading stones data:", error);
            setAvailableStones({});
        } finally {
            setLoading(false);
        }
    }

    async function mintStone() {
        if (minting) {
            return;
        }
        try {
            const { TxBase64 } = await api.prepareStoneMint({
                userPubKey: solanaWallet.address,
            });

            function base64ToUint8Array(base64) {
                const raw = atob(base64);
                const array = new Uint8Array(raw.length);
                for (let i = 0; i < raw.length; i++) {
                    array[i] = raw.charCodeAt(i);
                }
                return array;
            }

            const txBytes = base64ToUint8Array(TxBase64);
            const transaction = Transaction.from(txBytes);

            const serializedTx = transaction.serialize({
                requireAllSignatures: false,
                verifySignatures: false,
            });
            const txUint8Array = new Uint8Array(serializedTx);

            const { signedTransaction } = await signTransaction({
                wallet: solanaWallet,
                transaction: txUint8Array,
                chain: "solana:devnet",
            });

            console.log("🚀 Sending transaction...");
            const connection = new Connection(ENDPOINT, "confirmed");

            const txid = await connection.sendRawTransaction(signedTransaction);

            setIsMinting(true);

            mintTimeoutRef.current && clearTimeout(mintTimeoutRef.current);

            mintTimeoutRef.current = setTimeout(() => {
                console.warn("⏰ Mint SSE timeout");
                mintSSERef.current?.close();
                mintSSERef.current = null;
                console.error("Mint is taking longer than usual. Check your storage later ");
            }, 60000);

            mintSSERef.current?.close();
            mintSSERef.current = null;

            mintSSERef.current = api.checkStoneMint(txid, {
                onMessage: ({ Status, Data }) => {
                    if (Status === "confirmed") {
                        setMintSuccess(true);
                        mintFinishedRef.current = true;
                        clearTimeout(mintTimeoutRef.current);
                        mintTimeoutRef.current = null;
                        mintSSERef.current?.close();
                        mintSSERef.current = null;

                        console.log("🎉 Server confirmed mint!", Data);
                        console.log("🎉 Mint successful!");
                    }

                    if (Status === "failed") {
                        setMintError(true);
                        mintFinishedRef.current = true;
                        clearTimeout(mintTimeoutRef.current);
                        mintTimeoutRef.current = null;
                        mintSSERef.current?.close();
                        mintSSERef.current = null;
                        console.error("❌ Mint failed on server");
                    }
                },
                onError: () => {
                    console.warn("⚠️ SSE temporarily disconnected, retrying...");
                },
            });

            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");

            await connection
                .confirmTransaction(
                    {
                        signature: txid,
                        blockhash,
                        lastValidBlockHeight,
                    },
                    "confirmed"
                )
                .catch(console.warn);

            console.log("✅ NFT minted successfully!");
            console.log("🎉 Result:");
            console.log(`Transaction: ${txid}`);
            console.log(`TX Explorer: https://explorer.solana.com/tx/${txid}?cluster=devnet`);
        } catch (err) {
            console.error("❌ Transaction failed:");
            console.error(err);
        } finally {
            clearTimeout(mintTimeoutRef.current);
            mintTimeoutRef.current = null;
        }

        // PREV
        /*
        try {
            // === VALIDATION ===

            solanaWallet.publicKey = new PublicKey(solanaWallet.address);

            if (!solanaWallet || !solanaWallet.publicKey || !solanaWallet.signTransaction) {
                throw new Error("Wallet not connected");
            }

            // === SETUP ===
            const programId = new PublicKey(PROGRAM_ID);

            const provider = new anchor.AnchorProvider(connection, solanaWallet, { commitment: "confirmed" });
            anchor.setProvider(provider);

            const program = new anchor.Program(idl, provider);
            const collectionMint = new PublicKey(STONE_COLLECTION_MINT);

            console.log("🔧 Program initialized:", programId.toBase58());

            // === STONE TYPE PDAs ===
            const stoneTypePdas = [];
            console.log("📊 Fetching stone type stats...");

            for (const stoneType of STONE_TYPES) {
                const [stoneTypePda] = PublicKey.findProgramAddressSync(
                    [new TextEncoder().encode("stone_type"), new TextEncoder().encode(stoneType)],
                    programId
                );
                stoneTypePdas.push(stoneTypePda);

                try {
                    const stoneTypeAccount = await program.account.stoneType.fetch(stoneTypePda);
                    console.log(
                        `   ${stoneType}: ${stoneTypeAccount.mintedCount}/${stoneTypeAccount.supplyCap} minted`
                    );
                } catch (err) {
                    console.log(`   ${stoneType}: Not initialized. ${err}`);
                }
            }

            // === KEY PAIRS & PDAs ===
            const [collectionAuthority] = PublicKey.findProgramAddressSync(
                [new TextEncoder().encode("collection_authority")],
                programId
            );

            const mintKeypair = Keypair.generate();
            const mint = mintKeypair.publicKey;

            console.log("🔑 Generated new mint:", mint.toBase58());

            // === ACCOUNT DERIVATION ===
            const ownerAta = await getAssociatedTokenAddress(
                mint,
                solanaWallet.publicKey,
                false,
                TOKEN_PROGRAM_ID,
                ASSOCIATED_TOKEN_PROGRAM_ID
            );

            const [stoneStatePda] = PublicKey.findProgramAddressSync(
                [new TextEncoder().encode("stone_state"), mint.toBytes()],
                programId
            );

            const [metadata] = PublicKey.findProgramAddressSync(
                [new TextEncoder().encode("metadata"), TOKEN_METADATA_PROGRAM_ID.toBytes(), mint.toBytes()],
                TOKEN_METADATA_PROGRAM_ID
            );

            const [masterEdition] = PublicKey.findProgramAddressSync(
                [
                    new TextEncoder().encode("metadata"),
                    TOKEN_METADATA_PROGRAM_ID.toBytes(),
                    mint.toBytes(),
                    new TextEncoder().encode("edition"),
                ],
                TOKEN_METADATA_PROGRAM_ID
            );

            const [collectionMetadata] = PublicKey.findProgramAddressSync(
                [new TextEncoder().encode("metadata"), TOKEN_METADATA_PROGRAM_ID.toBytes(), collectionMint.toBytes()],
                TOKEN_METADATA_PROGRAM_ID
            );

            const [collectionMasterEdition] = PublicKey.findProgramAddressSync(
                [
                    new TextEncoder().encode("metadata"),
                    TOKEN_METADATA_PROGRAM_ID.toBytes(),
                    collectionMint.toBytes(),
                    new TextEncoder().encode("edition"),
                ],
                TOKEN_METADATA_PROGRAM_ID
            );

            const [treasury] = PublicKey.findProgramAddressSync([new TextEncoder().encode("treasury")], programId);

            // === TRANSACTION CONSTRUCTION ===
            const mintRent = await connection.getMinimumBalanceForRentExemption(82);
            const createMintAccountIx = SystemProgram.createAccount({
                fromPubkey: solanaWallet.publicKey,
                newAccountPubkey: mint,
                space: 82,
                lamports: mintRent,
                programId: TOKEN_PROGRAM_ID,
            });

            console.log("📦 Building transaction...");
            const user_id = 12345;

            const transaction = await program.methods
                .mintStoneInstance(user_id)
                .accounts({
                    mint,
                    owner: solanaWallet.publicKey,
                    ownerAta,
                    stoneState: stoneStatePda,
                    collectionMint,
                    collectionMetadata,
                    collectionMasterEdition,
                    metadata,
                    masterEdition,
                    collectionAuthority,
                    treasury,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                    tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
                    rent: SYSVAR_RENT_PUBKEY,
                    recentBlockhashes: SYSVAR_RECENT_BLOCKHASHES,
                })
                .remainingAccounts(
                    stoneTypePdas.map((pda) => ({
                        pubkey: pda,
                        isWritable: true,
                        isSigner: false,
                    }))
                )
                .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }), createMintAccountIx])
                .signers([mintKeypair])
                .transaction();

            // === TRANSACTION SIGNING ===
            console.log("✍️ Signing transaction...");

            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");

            transaction.recentBlockhash = blockhash;
            transaction.feePayer = solanaWallet.publicKey;
            transaction.partialSign(mintKeypair);

            const serializedTx = transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
            const txUint8Array = new Uint8Array(serializedTx);

            const { signedTransaction } = await signTransaction({
                wallet: solanaWallet,
                transaction: txUint8Array,
                chain: "solana:devnet",
            });

            console.log("🚀 Sending transaction...");

            const txid = await connection.sendRawTransaction(signedTransaction);

            const confirmation = await connection.confirmTransaction(
                {
                    signature: txid,
                    blockhash,
                    lastValidBlockHeight,
                },
                "confirmed"
            );

            if (confirmation.value.err) {
                throw new Error(`Transaction failed: ${confirmation.value.err}`);
            }

            // === POST-MINT VERIFICATION ===
            console.log("✅ NFT minted successfully!");
            console.log("🎉 Result:");
            console.log(`   Transaction: ${txid}`);
            console.log(`   Mint: ${mint.toBase58()}`);
            console.log(`   Explorer: https://explorer.solana.com/address/${mint.toBase58()}?cluster=devnet`);
            console.log(`   TX Explorer: https://explorer.solana.com/tx/${txid}?cluster=devnet`);

            const stoneState = await program.account.stoneState.fetch(stoneStatePda);
            console.log("🎮 Stone state:");
            console.log(`   Sparks: ${stoneState.sparksRemaining}/42`);

            console.log("📊 Updated stone type stats:");
            for (const stoneType of STONE_TYPES) {
                const [stoneTypePda] = PublicKey.findProgramAddressSync(
                    [new TextEncoder().encode("stone_type"), new TextEncoder().encode(stoneType)],
                    programId
                );

                try {
                    const stoneTypeAccount = await program.account.stoneType.fetch(stoneTypePda);
                    console.log(
                        `   ${stoneType}: ${stoneTypeAccount.mintedCount}/${stoneTypeAccount.supplyCap} minted`
                    );
                } catch (err) {
                    console.log(`   ${stoneType}: Not initialized. ${err}`);
                }
            }

            return {
                txid,
                mint: mint.toBase58(),
            };
        } catch (error) {
            console.error("❌ Minting failed:", error);

            if (error.logs) {
                console.error("📋 Transaction logs:");
                error.logs.forEach((log) => console.error(`${log}`));
            }

            throw error;
        }
            */
    }

    const formatSparks = (type) => (loading ? "..." : (availableStones[type] || 0).toString().padStart(2, "0"));

    return (
        <div className="flex-grow flex flex-col items-center text-white py-2">
            <div className="w-full flex justify-between px-6 py-2">
                <div className="flex flex-col">
                    <h2 className=" font-bold text-xl">BORFstone storage</h2>
                    <span className="text-xs">AUTHORIZED ACCESS ONLY // DEPT. 006</span>
                </div>
            </div>
            <div className="w-full h-4 bg-gray-100 border-b-2 border-black shadow-md"></div>
            <div className="w-full flex-grow flex items-center">
                {stoneDialog ? (
                    <div className="flex relative items-center justify-center w-full h-full p-6">
                        <button className="absolute top-2 right-2" onClick={() => setStoneDialog(null)}>
                            ❌
                        </button>
                        <Stone type={stoneDialog} />
                    </div>
                ) : (
                    <div className="relative">
                        <img
                            src={agateImage}
                            style={{
                                top: "35%",
                                left: "39.5%",
                                width: "20%",
                            }}
                            alt="agate"
                            className="absolute"
                            onClick={() => setStoneDialog("Agate")}
                        />
                        <div
                            className="flex flex-col gap-0.5 leading-none absolute text-xs text-lime-500"
                            style={{
                                top: "51%",
                                left: "39.5%",
                                width: "21%",
                            }}
                        >
                            <div>agate</div>
                            <div className="flex justify-between">
                                <div>sparks</div>
                                <div className="text-right">{formatSparks("Agate")}</div>
                            </div>
                        </div>
                        <img
                            src={jadeImage}
                            style={{
                                top: "21.5%",
                                left: "67%",
                                width: "20%",
                            }}
                            alt="jade"
                            className="absolute"
                            onClick={() => setStoneDialog("Jade")}
                        />
                        <div
                            className="flex flex-col gap-0.5 leading-none absolute text-xs text-lime-500"
                            style={{
                                top: "38%",
                                left: "66%",
                                width: "21%",
                            }}
                        >
                            <div>jade</div>
                            <div className="flex justify-between">
                                <div>sparks</div>
                                <div className="text-right">{formatSparks("Jade")}</div>
                            </div>
                        </div>
                        <img
                            src={topazImage}
                            alt="topaz"
                            style={{
                                top: "60%",
                                left: "39.5%",
                                width: "20%",
                            }}
                            className="absolute"
                            onClick={() => setStoneDialog("Topaz")}
                        />
                        <div
                            className="flex flex-col gap-0.5 leading-none absolute text-xs text-lime-500"
                            style={{
                                top: "75.7%",
                                left: "39.5%",
                                width: "21%",
                            }}
                        >
                            <div>topaz</div>
                            <div className="flex justify-between">
                                <div>sparks</div>
                                <div className="text-right">{formatSparks("Topaz")}</div>
                            </div>
                        </div>
                        <img
                            src={quartzImage}
                            style={{
                                top: "10.5%",
                                left: "11.5%",
                                width: "20%",
                            }}
                            alt="quartz"
                            className="absolute"
                            onClick={() => setStoneDialog("Quartz")}
                        />
                        <div
                            className="flex flex-col gap-0.5 leading-none absolute text-xs text-lime-500"
                            style={{
                                top: "26.7%",
                                left: "10.6%",
                                width: "21%",
                            }}
                        >
                            <div>quartz</div>
                            <div className="flex justify-between">
                                <div>sparks</div>
                                <div className="text-right">{formatSparks("Quartz")}</div>
                            </div>
                        </div>
                        <img
                            src={sapphireImage}
                            style={{
                                top: "59.5%",
                                left: "12%",
                                width: "20%",
                            }}
                            alt="sapphire"
                            className="absolute"
                            onClick={() => setStoneDialog("Sapphire")}
                        />
                        <div
                            className="flex flex-col gap-0.5 leading-none absolute text-xs text-lime-500"
                            style={{
                                top: "75.7%",
                                left: "10.6%",
                                width: "21%",
                            }}
                        >
                            <div>sapphire</div>
                            <div className="flex justify-between">
                                <div>sparks</div>
                                <div className="text-right">{formatSparks("Sapphire")}</div>
                            </div>
                        </div>
                        <img
                            src={amazoniteImage}
                            style={{
                                top: "10.5%",
                                left: "40%",
                                width: "20%",
                            }}
                            alt="amazonite"
                            className="absolute"
                            onClick={() => setStoneDialog("Amazonite")}
                        />
                        <div
                            className="flex flex-col gap-0.5 leading-none absolute text-xs text-lime-500"
                            style={{
                                top: "26.7%",
                                left: "39.5%",
                                width: "21%",
                            }}
                        >
                            <div>amazonite</div>
                            <div className="flex justify-between">
                                <div>sparks</div>
                                <div className="text-right">{formatSparks("Amazonite")}</div>
                            </div>
                        </div>
                        <img
                            src={rubyImage}
                            style={{
                                top: "35%",
                                left: "11.5%",
                                width: "20%",
                            }}
                            alt="ruby"
                            className="absolute"
                            onClick={() => setStoneDialog("Ruby")}
                        />
                        <div
                            className="flex flex-col gap-0.5 leading-none absolute text-xs text-lime-500"
                            style={{
                                top: "51%",
                                left: "10.6%",
                                width: "21%",
                            }}
                        >
                            <div>ruby</div>
                            <div className="flex justify-between">
                                <div>sparks</div>
                                <div className="text-right">{formatSparks("Ruby")}</div>
                            </div>
                        </div>
                        <div
                            className="uppercase leading-none absolute text-xs text-lime-500"
                            style={{
                                top: "86%",
                                left: "10.6%",
                            }}
                        >
                            {`>>spark energy stable...`}
                        </div>
                        <div
                            className="uppercase leading-none absolute text-xs text-cyan-500"
                            style={{
                                top: "46%",
                                left: "67%",
                            }}
                        >
                            {`sparks >>`}
                        </div>
                        <img src={storageImage} alt="storage" className="w-full h-auto object-contain" />
                    </div>
                )}
            </div>
            <div className="w-full h-4 bg-gray-100 shadow-md"></div>
            <div className="py-2">
                <Button disabled={!solanaWallet} onClick={mintStone} alt label={"mint"} />
            </div>
            {minting &&
                createPortal(
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                        {mintFinishedRef.current ? (
                            <div className="flex flex-col items-center text-white text-lg p-4 rounded-md bg-black/80">
                                {mintSuccess && (
                                    <div className="flex flex-col items-center">
                                        <span className="text-green-400 font-bold">🥳 Minted successfully!</span>
                                        <Link to={`/library`}>Check monster 👉</Link>
                                    </div>
                                )}
                                {mintError && <div className="text-red-400 font-bold">😖 Mint failed!</div>}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center text-white text-lg p-4 rounded-md bg-black/80">
                                <svg
                                    className="animate-spin h-10 w-10 mb-4 text-white"
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        className="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                                    />
                                </svg>
                                <span>Minting...</span>
                            </div>
                        )}
                    </div>,
                    document.body
                )}
        </div>
    );
}
