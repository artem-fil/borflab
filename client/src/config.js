import agate from "@images/agate.png";
import amazonite from "@images/amazonite.png";
import canopicaImg from "@images/canopica.png";
import coraluxImg from "@images/coralux.png";
import jade from "@images/jade.png";
import pack10 from "@images/pack10.png";
import pack25 from "@images/pack25.png";
import plushlandImg from "@images/plushland.png";
import quartz from "@images/quartz.png";
import ruby from "@images/ruby.png";
import sapphire from "@images/sapphire.png";
import topaz from "@images/topaz.png";

export const STONES = {
    Agate: {
        image: agate,
        species: "stone sentinel",
        lore: "tbd",
        rarity: "epic",
        color: "#fb923c",
        appearance:
            "The original creature’s shape is thickened and reinforced. Banded armor-like textures of earthy, vibrant natural tones swirl in gradients over limbs, like ancient sediment carved by time. Agate patterns form natural shields or defensive ridges.",
        personality:
            "These monsters are slow to act but impossible to move once decided. Loyal, dependable, and deeply grounded, they often act as team anchors or guardians.",
        abilities:
            "Agate monsters absorb incoming force, reflect energy, and lock down a position. They are immovable until they choose to be otherwise.",
    },
    Sapphire: {
        image: sapphire,
        species: "deepwave oracle",
        lore: "tbd",
        rarity: "epic",
        color: "#3b82f6",
        appearance:
            "Elegantly elongated, Sapphire monsters retain their base forms but take on fluid contours and wave-like movement. Edges glow in rich blue tones, like refracted ocean light, and extremities flicker with deep-sea shimmer.",
        personality:
            "They are calm, wise, and patient—creatures of foresight and observation. Often the tacticians or moral compass of a group.",
        abilities:
            "Sapphire sparks enable control of water flow, creation of rhythm-based pulses, or even short time-delay effects. Their influence is rarely loud, but always pivotal.",
    },
    Ruby: {
        image: ruby,
        species: "heartfire catalyst",
        lore: "tbd",
        rarity: "epic",
        color: "#ef4444",
        appearance:
            "Striking, glowing crimson veins and ember-hued eyes break through the creature’s original form. Protrusions pulse with inner fire. Retaining their native colors, these creatures seem backlit by a molten ruby glow.",
        personality:
            "Fiery and daring, Ruby monsters embody impulsive courage and kinetic energy. Always ready to leap into danger, they form deep bonds fast and defend them with ferocity.",
        abilities:
            "In battle, Ruby sparks unleash sudden bursts of strength or flame, acting as frontline initiators. Their aura is a warning: “Do not provoke unless prepared to burn.”",
    },
    Quartz: {
        image: quartz,
        species: "base namibian",
        lore: "tbd",
        rarity: "common",
        color: "#e2e8f0",
        appearance:
            "Quartz creatures retain their original biome-born shapes and natural coloration. Protrusions like horns in Quarts. Their surfaces shimmer faintly with pure clarity, acting like polished memory-glass—untainted, unaltered.",
        personality:
            "These monsters are calm, observant, and steady, moving with graceful intent. They embody the pure essence of imagination made manifest, without distortion.",
        abilities:
            "Their presence amplifies natural strengths: they stabilize unstable beings, diffuse conflict, and offer quiet clarity. When in proximity to chaos, Quartz monsters become the eye of the storm.",
    },
    Amazonite: {
        image: amazonite,
        species: "twilight wanderer",
        lore: "tbd",
        rarity: "rare",
        color: "#2dd4bf",
        appearance:
            "With streaks of bright indigo-to-violet gradients washing over translucent fins or frills, Tanzanite-sparked creatures shimmer like dusk caught in motion. Body shapes stay true to the base form, but ripple with lightning-like flux and subtle flickers, as if barely anchored to the present.",
        personality:
            "These monsters are elusive and sensitive—drawn to liminal spaces and intuitive action. They often vanish without warning, only to reappear where most needed.",
        abilities:
            "Gifted with the ability to phase briefly between visible states or perceive hidden echoes in terrain, they navigate by intuition and resonance rather than sight. Lightning fuels their brief surges of motion.",
    },
    Jade: {
        image: jade,
        species: "verdant guardian",
        lore: "tbd",
        rarity: "legendary",
        color: "#22c55e",
        appearance:
            "A grounded and majestic, elegant creature carved in Jade, standing tall and proud, with bold elements of original colors: ridges, horns, or limbs become lacquered and leaf-veined in Jade. ",
        personality:
            "Regal, composed, and protective. Jade monsters move with dignity. They serve as guardians not just of allies, but of higher principles. Their loyalty is matched only by their resolve.",
        abilities:
            "Channel restorative forces, creating shields or verdant bursts of life energy. Can block corruption, mend terrain, and anchor reality in unstable zones. Their power is silent, but absolute.",
    },
    Topaz: {
        image: topaz,
        species: "skyfire seer",
        lore: "tbd",
        rarity: "mythic",
        color: "#facc15",
        appearance:
            "Color: The creature glows from within with radiant,  yellow shades of sunlight. Form:  Its base shape develops mirror-like plates, prismatic crests, or solar spots. Eyes shine with bright awareness. ",
        personality:
            "These monsters are luminous thinkers and charismatic leaders. Joyful but focused, they draw others into motion and inspiration.",
        abilities:
            "Topaz sparks bring radiant disruption—flashes that blind enemies or reveal truths. They often detect threats before they occur and redirect energy with precision.",
    },
};

export const RARITIES = {
    common: "text-white",
    rare: "text-blue-500",
    epic: "text-purple-500",
    mythic: "text-yellow-500",
    legendary: "text-red-500",
};

export const BIOMES = {
    amazonia: {
        bg: `bg-canopica-dark`,
        border: `border-canopica-dark`,
        text: `text-canopica-dark`,
        icon: canopicaImg,
    },
    plushland: {
        bg: `bg-plushland-dark`,
        border: `border-plushland-dark`,
        text: `text-plushland-dark`,
        icon: plushlandImg,
    },
    coralux: {
        bg: `bg-coralux-dark`,
        border: `border-coralux-dark`,
        text: `text-coralux-dark`,
        icon: coraluxImg,
    },
};

export const PRODUCTS = {
    pack10: pack10,
    pack25: pack25,
};
