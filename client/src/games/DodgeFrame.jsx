import { useEffect, useRef, useState } from "react";
import frameImg from "../assets/images/dodge-frame.webp";
import { FRAME_ASPECT, LAYOUT } from "./core/config";

import { C, MONO, pct } from "./dodgeTheme";

function Field({ label, value, u, labelStyle }) {
    return (
        <div style={{ minWidth: 0 }}>
            <div style={labelStyle}>{label}</div>
            <div
                style={{
                    fontSize: 3.6 * u,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                }}
            >
                {value}
            </div>
        </div>
    );
}

/**
 * Общая рамка: HUD сверху, "комната" в окне фрейма, сам фрейм поверх.
 * room: (u) => ReactNode  — содержимое комнаты (u = 1% ширины фрейма)
 * children — всё, что надо положить поверх фрейма (зоны кнопок)
 */
export default function DodgeFrame({
    rootProps,
    onSize,
    avatarSrc,
    avatarFallback = "Loading...",
    name,
    idText,
    orbsText = "000",
    statusText = "---",
    difficulty = "",
    roomProps,
    roomBackground = "#05090d",
    room,
    bottomBar,
    children,
}) {
    const rootRef = useRef(null);
    const [box, setBox] = useState({ w: 0, h: 0 });

    // вписываем фрейм в доступное место (contain)
    useEffect(() => {
        const el = rootRef.current;
        if (!el) return;
        const ro = new ResizeObserver(([e]) => {
            const { width, height } = e.contentRect;
            const w = Math.min(width, height * FRAME_ASPECT);
            setBox({ w: Math.floor(w), h: Math.floor(w / FRAME_ASPECT) });
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    useEffect(() => {
        onSize?.(box);
    }, [box, onSize]);

    const u = box.w / 100;
    const labelStyle = { fontSize: 2.3 * u, color: C.greenDim, letterSpacing: 0.1 * u, whiteSpace: "nowrap" };

    return (
        <div
            ref={rootRef}
            {...rootProps}
            style={{
                position: "relative",
                flexGrow: 1,
                minHeight: 0,
                width: "100%",
                overflow: "hidden",
                touchAction: "none",
                userSelect: "none",
                WebkitUserSelect: "none",
                WebkitTapHighlightColor: "transparent",
            }}
        >
            {box.w > 0 && (
                <div
                    style={{
                        position: "absolute",
                        left: "50%",
                        top: "50%",
                        width: box.w,
                        height: box.h,
                        transform: "translate(-50%,-50%)",
                    }}
                >
                    {/* HUD под фреймом */}
                    <div
                        style={{
                            position: "absolute",
                            ...pct(LAYOUT.topHole),
                            background: C.hudBg,
                            display: "flex",
                            alignItems: "center",
                            gap: 2.2 * u,
                            padding: `0 ${3 * u}px`,
                            boxSizing: "border-box",
                            fontFamily: MONO,
                            color: C.green,
                            overflow: "hidden",
                        }}
                    >
                        {avatarSrc ? (
                            <img
                                src={avatarSrc}
                                alt=""
                                draggable={false}
                                style={{ height: "86%", aspectRatio: "1 / 1", objectFit: "contain", flexShrink: 0 }}
                            />
                        ) : (
                            <div
                                style={{
                                    height: "86%",
                                    aspectRatio: "1 / 1",
                                    flexShrink: 0,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: 3 * u,
                                    fontWeight: 700,
                                    textAlign: "center",
                                }}
                            >
                                {avatarFallback}
                            </div>
                        )}
                        <div style={{ width: 1, alignSelf: "stretch", margin: `${3 * u}px 0`, background: C.line }} />
                        <div
                            style={{
                                flex: 1,
                                minWidth: 0,
                                display: "flex",
                                flexDirection: "column",
                                justifyContent: "center",
                                gap: 2.2 * u,
                            }}
                        >
                            <Field label="BORF NAME:" value={name} u={u} labelStyle={labelStyle} />
                            <Field label="BORFOLOGIST ID:" value={idText} u={u} labelStyle={labelStyle} />
                        </div>
                        <div style={{ width: 1, alignSelf: "stretch", margin: `${3 * u}px 0`, background: C.line }} />
                        <div style={{ width: "30%", textAlign: "center", flexShrink: 0 }}>
                            <div style={labelStyle}>ORBS DODGED</div>
                            <div style={{ fontSize: 9.5 * u, fontWeight: 700, lineHeight: 1.1 }}>{orbsText}</div>
                            <div style={labelStyle}>{statusText}</div>
                        </div>
                    </div>

                    {/* Комната */}
                    <div
                        {...roomProps}
                        style={{
                            position: "absolute",
                            ...pct(LAYOUT.roomHole),
                            overflow: "hidden",
                            background: roomBackground,
                            touchAction: "none",
                        }}
                    >
                        {room?.(u)}
                    </div>

                    {/* Фрейм поверх */}
                    <img
                        src={frameImg}
                        alt=""
                        draggable={false}
                        style={{
                            position: "absolute",
                            inset: 0,
                            width: "100%",
                            height: "100%",
                            zIndex: 3,
                            pointerEvents: "none",
                        }}
                    />
                    {(() => {
                        const content = bottomBar?.(u);
                        if (!content) return null;
                        return (
                            <div
                                style={{
                                    position: "absolute",
                                    ...pct(LAYOUT.bottomBar),
                                    zIndex: 6, // выше текста сложности (4) и зон кнопок (5)
                                    display: "flex",
                                    boxSizing: "border-box",
                                    background: "#0a1a14",
                                    border: `1px solid ${C.line}`,
                                    fontFamily: MONO,
                                }}
                            >
                                {content}
                            </div>
                        );
                    })()}
                    {/* Значение сложности после нарисованного "DIFFICULTY:" */}
                    <div
                        style={{
                            position: "absolute",
                            left: `${LAYOUT.difficultyText.x * 100}%`,
                            top: `${LAYOUT.difficultyText.y * 100}%`,
                            transform: "translateY(-50%)",
                            zIndex: 4,
                            pointerEvents: "none",
                            fontFamily: MONO,
                            fontSize: LAYOUT.difficultyText.size * box.w,
                            color: "#4fd68a",
                            whiteSpace: "nowrap",
                        }}
                    >
                        {difficulty}
                    </div>

                    {children}
                </div>
            )}
        </div>
    );
}
