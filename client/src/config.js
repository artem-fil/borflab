import { PublicKey, clusterApiUrl } from "@solana/web3.js";

import agateFull from "./assets/agate.png";
import jadeFull from "./assets/jade.png";
import topazFull from "./assets/topaz.png";
import quartzFull from "./assets/quartz.png";
import sapphireFull from "./assets/sapphire.png";
import amazoniteFull from "./assets/amazonite.png";
import rubyFull from "./assets/ruby.png";
import agateThumb from "./assets/agate_thumb.png";
import jadeThumb from "./assets/jade_thumb.png";
import topazThumb from "./assets/topaz_thumb.png";
import quartzThumb from "./assets/quartz_thumb.png";
import sapphireThumb from "./assets/sapphire_thumb.png";
import amazoniteThumb from "./assets/amazonite_thumb.png";
import rubyThumb from "./assets/ruby_thumb.png";

const CLUSTER = "devnet";

export const ENDPOINT = clusterApiUrl(CLUSTER);
export const PROGRAM_ID = new PublicKey("2Wr2VbaMpGA5cLJrdpcHQpRmXtbdyypMoa9VzMuAhV3A");
export const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

export const STONES = {
    Agate: {
        thumb: agateThumb,
        full: agateFull,
        species: "stone sentinel",
        lore: "tbd",
        rarity: "epic",
        appearance:
            "The original creature’s shape is thickened and reinforced. Banded armor-like textures of earthy, vibrant natural tones swirl in gradients over limbs, like ancient sediment carved by time. Agate patterns form natural shields or defensive ridges.",
        personality:
            "These monsters are slow to act but impossible to move once decided. Loyal, dependable, and deeply grounded, they often act as team anchors or guardians.",
        abilities:
            "Agate monsters absorb incoming force, reflect energy, and lock down a position. They are immovable until they choose to be otherwise.",
    },
    Sapphire: {
        thumb: sapphireThumb,
        full: sapphireFull,
        species: "deepwave oracle",
        lore: "tbd",
        rarity: "epic",
        appearance:
            "Elegantly elongated, Sapphire monsters retain their base forms but take on fluid contours and wave-like movement. Edges glow in rich blue tones, like refracted ocean light, and extremities flicker with deep-sea shimmer.",
        personality:
            "They are calm, wise, and patient—creatures of foresight and observation. Often the tacticians or moral compass of a group.",
        abilities:
            "Sapphire sparks enable control of water flow, creation of rhythm-based pulses, or even short time-delay effects. Their influence is rarely loud, but always pivotal.",
    },
    Ruby: {
        thumb: rubyThumb,
        full: rubyFull,
        species: "heartfire catalyst",
        lore: "tbd",
        rarity: "epic",
        appearance:
            "Striking, glowing crimson veins and ember-hued eyes break through the creature’s original form. Protrusions pulse with inner fire. Retaining their native colors, these creatures seem backlit by a molten ruby glow.",
        personality:
            "Fiery and daring, Ruby monsters embody impulsive courage and kinetic energy. Always ready to leap into danger, they form deep bonds fast and defend them with ferocity.",
        abilities:
            "In battle, Ruby sparks unleash sudden bursts of strength or flame, acting as frontline initiators. Their aura is a warning: “Do not provoke unless prepared to burn.”",
    },
    Quartz: {
        thumb: quartzThumb,
        full: quartzFull,
        species: "base namibian",
        lore: "tbd",
        rarity: "common",
        appearance:
            "Quartz creatures retain their original biome-born shapes and natural coloration. Protrusions like horns in Quarts. Their surfaces shimmer faintly with pure clarity, acting like polished memory-glass—untainted, unaltered.",
        personality:
            "These monsters are calm, observant, and steady, moving with graceful intent. They embody the pure essence of imagination made manifest, without distortion.",
        abilities:
            "Their presence amplifies natural strengths: they stabilize unstable beings, diffuse conflict, and offer quiet clarity. When in proximity to chaos, Quartz monsters become the eye of the storm.",
    },
    Amazonite: {
        thumb: amazoniteThumb,
        full: amazoniteFull,
        species: "twilight wanderer",
        lore: "tbd",
        rarity: "rare",
        appearance:
            "With streaks of bright indigo-to-violet gradients washing over translucent fins or frills, Tanzanite-sparked creatures shimmer like dusk caught in motion. Body shapes stay true to the base form, but ripple with lightning-like flux and subtle flickers, as if barely anchored to the present.",
        personality:
            "These monsters are elusive and sensitive—drawn to liminal spaces and intuitive action. They often vanish without warning, only to reappear where most needed.",
        abilities:
            "Gifted with the ability to phase briefly between visible states or perceive hidden echoes in terrain, they navigate by intuition and resonance rather than sight. Lightning fuels their brief surges of motion.",
    },
    Jade: {
        thumb: jadeThumb,
        full: jadeFull,
        species: "verdant guardian",
        lore: "tbd",
        rarity: "legendary",
        appearance:
            "A grounded and majestic, elegant creature carved in Jade, standing tall and proud, with bold elements of original colors: ridges, horns, or limbs become lacquered and leaf-veined in Jade. ",
        personality:
            "Regal, composed, and protective. Jade monsters move with dignity. They serve as guardians not just of allies, but of higher principles. Their loyalty is matched only by their resolve.",
        abilities:
            "Channel restorative forces, creating shields or verdant bursts of life energy. Can block corruption, mend terrain, and anchor reality in unstable zones. Their power is silent, but absolute.",
    },
    Topaz: {
        thumb: topazThumb,
        full: topazFull,
        species: "skyfire seer",
        lore: "tbd",
        rarity: "mythic",
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
    mythic: "text-yellow-500",
    epic: "text-purple-500",
    legendary: "text-red-500",
};
