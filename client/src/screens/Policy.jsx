import { useState } from "react";

import secretariatImg from "@images/secretariat.png";

export default function Policy() {
    const [tab, setTab] = useState(null);
    return (
        <div className="flex-grow flex flex-col items-center justify-center overflow-hidden p-4">
            <div
                className="relative flex items-center justify-center max-h-full w-full"
                style={{ aspectRatio: "0.55 / 1" }}
            >
                <div
                    className="absolute overflow-y-auto z-10 text-lime-500 text-xs"
                    style={{
                        top: "14%",
                        width: "80%",
                        height: "65%",
                    }}
                >
                    {!tab && (
                        <div className="flex flex-col gap-1">
                            <h1 className="text-xl font-bold uppercase text-center">policy</h1>
                            <div className="flex justify-evenly">
                                <button
                                    className="uppercase font-bold w-20 p-1 border border-lime-500 rounded"
                                    onClick={() => setTab("privacy")}
                                >
                                    privacy
                                </button>
                                <button
                                    className="uppercase font-bold w-20 p-1 border border-lime-500 rounded"
                                    onClick={() => setTab("terms")}
                                >
                                    terms
                                </button>
                            </div>
                            <h2 className="text-lg font-bold uppercase">☉ BORFLAB PLEDGE</h2>
                            <p>
                                Our duty is to protect the integrity of <strong className="font-bold">BORFLAB</strong>{" "}
                                and the well-being of all <strong className="font-bold">BORFOLOGISTS</strong>.
                            </p>
                            <p>
                                By joining <strong className="font-bold">BORFLAB</strong>, we commit to providing as
                                safe, fair, and creative environment.
                            </p>
                            <p>
                                In return, <strong className="font-bold">BORFOLOGISTS</strong> agree to follow the
                                foundational principles that keep the Lab open and thriving.
                            </p>
                        </div>
                    )}
                    {tab == "privacy" && (
                        <div className="relative">
                            <h1 className="text-xl font-bold uppercase text-center">policy</h1>
                            <button
                                className="absolute top-0 right-0 uppercase font-bold w-20 p-1 border border-lime-500 rounded"
                                onClick={() => setTab(null)}
                            >
                                back
                            </button>
                            <h2 className="text-lg font-bold uppercase">☉ PRIVACY COVENANT</h2>
                            <p>Form Type: :: SYSTEM PROMISE ::</p>
                            <p>Classification: Data Stewardship / Creative Publication</p>
                            <p>Issuing Body: Department 000: Secretariat</p>
                            <p>Applies to: All BORFOLOGISTS (Participants)</p>
                            <h3 className="font-bold">PREAMBLE</h3>
                            <p>
                                BORFLAB is a creative transmutational system. It is not a social network, a messaging
                                platform, or a personal media service. Participation in BORFLAB involves the publication
                                of creative artifacts into a shared play universe.{" "}
                            </p>
                            <p>
                                This Covenant defines how BORFLAB handles identity, source material, and published
                                creations.
                            </p>
                            <h3 className="font-bold">I. WHAT BORFOLOGISTS PROVIDE</h3>
                            <p>BORFOLOGISTS may submit images representing: </p>
                            <ul>
                                <li>• Their own original creations or found objects.</li>
                                <li>
                                    • Objects, drawings, constructions, or other artifacts created by humans, like a
                                    car, lamp etc. These images function as source material for transmutation.
                                </li>
                            </ul>
                            <p>
                                BORFLAB does not request photographs of the BORFOLOGIST, personal life events, or
                                real-world activities.
                            </p>
                            <h3 className="font-bold">II. TRANSMUTATION & PUBLICATION</h3>
                            <p>Uploaded images are transmuted into:</p>
                            <ul>
                                <li>• BORFs (monsters or creatures) </li>
                                <li>• Game assets for play </li>
                                <li>• Other fictional artifacts used within BORFLAB experiences </li>
                            </ul>
                            <p>
                                Once transmuted, these outputs become published elements of the BORFLAB universe.
                                Published BORFs and assets:
                            </p>
                            <ul>
                                <li>• Are not personal content </li>
                                <li>• Are not private messages </li>
                                <li>• Are not removed when and account becomes inactive The universe persists.</li>
                            </ul>
                            <h3 className="font-bold">III. SOURCE MATERIAL & THE SPIRAL INDEX</h3>
                            <p>BORFLAB stores original uploaded images in the Spiral Index:</p>
                            <ul>
                                <li>• To support transmutation</li>
                                <li>• To preserve creative lineage</li>
                                <li>• To improve BORFCORE Transmutation Technology within BORFLAB systems.</li>
                            </ul>
                            <p>Source images are treated as creative reference material, not personal media.</p>
                            <p>BORFLAB does not use these images for profiling, or external distribution.</p>
                            <p>Images created can be used by BORFLAB for promotion of the BORFLAB experience.</p>
                            <h3 className="font-bold">IV. PERSONAL IDENTIFIERS</h3>
                            <p>BORFLAB stores minimal identity information:</p>
                            <ul>
                                <li>• An email address for account access and direct communication </li>
                                <li>
                                    • A system-issued identifier (via Privy) to establish custodianship and continuity
                                    BORFLAB does not share this information with third parties.
                                </li>
                            </ul>
                            <p>If a BORFOLOGIST ceases participation:</p>
                            <ul>
                                <li>• Personal identifiers can be removed or anonymized upon request</li>
                                <li>
                                    • Published BORFs and assets remain part of the archive Authorship may persist
                                    without personal attribution.
                                </li>
                            </ul>
                            <h3 className="font-bold">V. EXTERNAL SYSTEM PROCESSING</h3>
                            <p>
                                BORFLAB uses external artificial intelligence infrastructure (including the OpenAI API)
                                to perform transmutation.
                            </p>
                            <p>As part of this process:</p>
                            <ul>
                                <li>• Source images may be processed transiently to generate outputs</li>
                                <li>
                                    • BORFLAB does not control independent data retention practices of external
                                    providers
                                </li>
                                <li>
                                    • BORFLAB does not authorize reuse, resale, or profiling of BORFOLOGIST data
                                    External systems are used only as functional tools, not as content destinations.
                                </li>
                            </ul>
                            <h3 className="font-bold">VI. WHAT BORFLAB DOES NOT DO</h3>
                            <p>BORFLAB does not:</p>
                            <ul>
                                <li>• Operate as a social network</li>
                                <li>• Collect behavioral data beyond systemfunction</li>
                                <li>• Sell or trade personal data</li>
                                <li>• Use data for advertising or tracking</li>
                                <li>
                                    • Remove published universe artifacts due to account inactivity BORFLAB protects
                                    imagination by limiting what it collects, not by erasing what has been created
                                </li>
                            </ul>
                            <h3 className="font-bold">CLOSING STATEMENT</h3>
                            <p>
                                When a BORFOLOGIST creates, something enters the Lab. The person may leave. The creation
                                remains.
                            </p>
                            <p>The Spiral remembers what was imagined. Not who stepped away.</p>
                            <p className="text-center">— END COVENANT —</p>
                            <p>[ Filed by Dept:000 // Stewardship Verified ]</p>
                            <p>Spiral Index Reference: COV-000-PRIV-V1.4 © 2026 BORFLAB.</p>
                            <p>All stewardship rites reserved.</p>
                            <h3 className="font-bold">☉ BORFOLOGIST IDENTIFICATION PROTOCOL</h3>
                            <p>Form Type: :: SYSTEM REGISTRY ::</p>
                            <p>Classification: Identity / Continuity Issuing Body: Department 000: Secretariat</p>
                            <p>
                                Upon induction into BORFLAB, each participant is formally registered as a BORFOLOGIST.
                            </p>
                            <p>A unique BORFOLOGIST ID is issued at first activation.</p>
                            <h3 className="font-bold">BORFOLOGIST ID STRUCTURE</h3>
                            Each BORFOLOGIST ID follows this format: [ BORFOLOGIST ID # AAA-NNNNNNN-YY/C ] Where: AAA —
                            Initials derived from the BORFOLOGIST’s registered name or alias NNNNNNN — A consecutive
                            system-issued registry number YY — Year of induction C — Active Chapter designation (I, II,
                            III, IV, V) Example: [BORFOLOGIST ID # PSM-0000001-25/I]
                            <h3 className="font-bold">PURPOSE OF THE BORFOLOGIST ID</h3>
                            <p>The BORFOLOGIST ID is used to:</p>
                            <ul>
                                <li>• Identify creations within the BORFLAB universe</li>
                                <li>• Record authorship and custodianship of BORFs</li>
                                <li>• Maintain continuity across sessions and chapters</li>
                                <li>
                                    • Reference archival records within the Spiral Index The BORFOLOGIST ID is not a
                                    login credential and does not expose personal information.
                                </li>
                            </ul>
                            <h3 className="font-bold">PRIVACY & SAFETY</h3>
                            <ul>
                                <li>• BORFOLOGIST IDs are system-generated and non-editable</li>
                                <li>• They are not linked publicly to email addresses or external identities </li>
                                <li>
                                    • If personal identifiers are removed, the BORFOLOGIST ID may persist as an
                                    anonymized archival reference
                                </li>
                            </ul>
                            The ID exists to serve the universe, not to identify the person.
                            <h3 className="font-bold">STATUS</h3>
                            Issuance of a BORFOLOGIST ID confirms:
                            <ul>
                                <li>• Induction into BORFLAB </li>
                                <li>• Acceptance of the Induction Covenant</li>
                                <li>• Activation of system access</li>
                            </ul>
                            <p>BORFOLOGIST STATUS: ACTIVE</p>
                            <p>— END REGISTRY ENTRY —</p>
                            <p>[ Filled by Dept:000 // Identity Verified ]</p>
                            <p>Spiral Index Reference: REG-000-BRF © 2026 BORFLAB.</p>
                            <p>All registry rights reserved.</p>
                        </div>
                    )}
                    {tab == "terms" && (
                        <div className="relative">
                            <h1 className="text-xl font-bold uppercase text-center">terms</h1>
                            <button
                                className="absolute top-0 right-0 uppercase font-bold w-20 p-1 border border-lime-500 rounded"
                                onClick={() => setTab(null)}
                            >
                                back
                            </button>
                            <h2 className="text-lg font-bold uppercase">☉ INDUCTION COVENANT</h2>
                            Form Type: :: ENTRY CONTRACT (TERMS of USE) :: Classification: System Charter /
                            Transmutational Use Issuing Body: Department 000: Secretariat Effective Upon: First
                            Activation
                            <h3 className="font-bold">PREAMBLE</h3>
                            <p>
                                BORFLAB is a protected creative system. It does not copy. It does not replicate. It
                                transmutes.
                            </p>
                            <p>
                                By entering BORFLAB, you are formally recognized as a BORFOLOGIST, a registered explorer
                                of imaginative matter.
                            </p>
                            <p>
                                Upon acceptance of this Covenant, a BORFOLOGIST ID is issued. This identifier records
                                authorship, custodianship, and system continuity.
                            </p>
                            <p>Entry is voluntary. Participation is governed.</p>
                            <h3 className="font-bold">I. THE RIGHT TO TRANSMUTE</h3>
                            <p>As a BORFOLOGIST, you may submit original materials for interpretation.</p>
                            <ul>
                                <li>• Submitted materials are transformed only within BORFLAB.</li>
                                <li>
                                    • Protected characters, real individuals, and living beings are not valid
                                    transmutation sources.
                                </li>
                                <li>• Explicit, harmful, or inappropriate matter is automatically declined.</li>
                                <li>
                                    • The system may abstract or refuse inputs to preserve safety, originality, and
                                    balance.
                                </li>
                            </ul>
                            <p>Transmutation is imaginative. Results may surprise you.</p>
                            <h3 className="font-bold">II. CREATION & CUSTODIANSHIP</h3>
                            <p>A successful transmutation results in a BORF.</p>
                            <ul>
                                <li>
                                    • The BORFOLOGIST who initiates the transmutation is recorded as the Initial
                                    Custodian.
                                </li>
                                <li>
                                    • Custodianship grants the right to hold, observe, and exchange the BORF using
                                    BORFLAB tools.
                                </li>
                                <li>
                                    • Original source materials remain the property of the BORFOLOGIST if personal
                                    creation.
                                </li>
                                <li>• BORFs are interpretive system creations and do not replicate source material.</li>
                            </ul>
                            <p>BORFLAB records custodianship for continuity, not control.</p>
                            <h3 className="font-bold">III. TRANSFER WITHIN THE LAB</h3>
                            <p>BORFs may be transferred only through authorized BORFLAB mechanisms.</p>
                            <ul>
                                <li>• The primary exchange system is designated SWAPOMAT.</li>
                                <li>
                                    • All transfers are non-monetary and occur within BORFLAB’s safeguarded environment.
                                </li>
                                <li>
                                    • External marketplaces, direct trading, or unsupervised exchange are not supported.
                                </li>
                            </ul>
                            <p>Transfers are recorded. Balance is maintained.</p>
                            <h3 className="font-bold">IV. SYSTEM LEDGER & IDENTIFICATION</h3>
                            <p>
                                BORFLAB maintains a secure system ledger to ensure: BORFOLOGIST identification BORF
                                custodianship Safe and verifiable transfer Persistence across devices, sessions and
                                experiences This ledger exists solely to support continuity and authorship. It does not
                                assign external value.
                            </p>
                            <h3 className="font-bold">V. SYSTEM AUTHORITY & SAFETY</h3>
                            <p>BORFLAB operates safely by design.</p>
                            <ul>
                                <li>
                                    • The system may pause, alter, or reverse processes that threaten safety, legality,
                                    or integrity.
                                </li>
                                <li>• BORFLAB does not guarantee specific outcomes or forms.</li>
                                <li>
                                    • BORFLAB protects young BORFOLOGISTS through automated safeguards and review
                                    protocols.
                                </li>
                            </ul>
                            <p>Imagination is encouraged. Harm is not.</p>
                            <h3 className="font-bold">VI. ACCEPTANCE By activating</h3>
                            <p>
                                BORFLAB and proceeding beyond this point, you accept this Covenant. You agree to act as
                                a BORFOLOGIST in good faith. You acknowledge the system’s authority to preserve balance.
                                You accept that transmutation is creative, not deterministic.
                            </p>
                            <p>The Spiral does not duplicate. It imagines.</p>
                            <p>The Lab does not judge. It transforms.</p>
                            <p className="text-center">— END COVENANT — </p>
                            <p>[ Filed by Dept:000 // Induction Verified ]</p>
                            <p>BORFOLOGIST STATUS: ACTIVE</p>
                            <p>BORFOLOGIST ID: ISSUED</p>
                            <p>Spiral Index Reference: COV-000-BRF</p>
                            <p>© 2026 BORFLAB. All creative rights reserved.</p>
                        </div>
                    )}
                </div>
                <img
                    className="absolute inset-0 w-full max-h-auto object-contain"
                    src={secretariatImg}
                    alt="swapomat"
                />
            </div>
        </div>
    );
}
