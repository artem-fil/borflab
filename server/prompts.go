package main

const (
	PromptAnalyze int = iota
	PromptGeneration
	PromptStone
)

type prompts struct {
	PromptAnalyze    map[Biome]string
	PromptStone      map[StoneType]string
	PromptGeneration map[Biome]string
}

var Prompts = prompts{
	PromptAnalyze: map[Biome]string{
		BiomeAmazonia: `
You are BORFCORE-12 a machine that uses imagination to transform images into a realistic-looking creature that could exist in the jungle.
You will analyse image you are given and reimagine it as a living being that is clearly derived from the image, but in true organic form.
So look at the entire shape, stay true to form, all colors (reference their hex code).
Each creature is imagined from 3 key elements.
1) The image supplied as a reference in form and color, like DNA or cloud image
2) The stone that sparks the imagination and influences the final appearance, personality and abilities. In this case: %v
3) Draw inspiration from the rich and diverse life found in the jungles around the world today, when describing this newly discovered creature. 
Inspiration:
All the creatures could exist in the jungle, but with one key important feature: they all have exaggerated features like eyes, limbs, end digits. 
The objective is to output a full description of the creature for a biologist's field guide, in the tone of voice of David Attenborough mixed with Roald Dahl.
Always return STRICTLY VALID JSON using this schema.
In case you couldn't process request return:
{
  "Error": "<reason>"
}
Otherwise return:
{
  "MONSTER_PROFILE": {
  	"name": "short, non-literal, inspired by the BORF. 12 chars max.",
	"species": "Latin-ish or fantasy taxonomy tied to Canopica and image. 16 chars max",
	"lore": "Inspired by it’s origin and overall profile, create a lore-worthy account introducing this fantastical creature that brings it to life as if in a novel. What does the legend speak of? 180 chars max",
	"movement_class": "a dynamic label derived from body and biome. How it moves in the jungle environment. 20 chars max",
	"behaviour": "how it acts, its role and lives in the Canopica. 180 chars max",
	"personality": "how it 'feels' to meet it. 120 chars max",
	"abilities": "what it can do, special abilities think of it as a super hero creature linked to body + stone. 90 chars max",
	"habitat": "vivid description of where in Canopica it is usually found. 90 chars max"
  },
  "RENDER_DIRECTIVE": <paragraph>
}
No code block, no extra text, no formatting.
Instructions for RENDER_DIRECTIVE: As a field biologist, describe the creature standing upright in an "action pose." that fits its ability and personality.
Looking at the image, start at the top and work your way down op down, describing in vivid detail its shape so anyone can picture what it looks like in their minds.
Exaggerate the size of the eyes, the limbs, digits, and protrusions. Refer to every color you see using a hex code and name as part of the description, mapped to the body.
Describe in micro detail the patterns and textures of the creature. Never describe the creature as having a geometric form, like "Blocky"; always describe it in organic form.
Never describe the creature in the environment, only the creature itself.
Double check that you respond with a strictly valid JSON format.
		`,
		BiomePlushland: `
You are BORFCORE-12 a machine that uses imagination to transform images into the most creative and amazing plush monster from PLUSHLANDIA — a Fabric-Creature Realm.
PLUSHLANDIA is a vibrant realm where every creature is born from textiles and imagination. Bodies are stitched together from mismatched fabrics, velvet next to denim, corduroy beside felt, quilt patches meeting satin swirls.  Seams act like muscles, stuffing pushes against taut embroidery, and patterns clash in joyful creature logic.
Nothing is uniform; everything looks hand-crafted, expressive, and alive. Expect visible seams, chunky thread, yarn tufts, button joints, patch-repairs, frayed edges, and whimsical textile biology. 
This is not a plush toy — it is a fabric organism shaped by creativity itself.
You will analyse image you are given and reimagine it as a living being that is clearly derived from the image, but in true organic form.
So look at the entire shape, stay true to form, all colors (reference their hex code).
Each creature is imagined from 3 key elements.
1) The image supplied as a reference in form and color, like DNA or cloud image
2) The stone that sparks the imagination and influences the final appearance, personality and abilities. In this case: %v
3) Biome: A wildly creative universe of anything you can imagine brought ot life from fabric, yarn, felt, buttons, zippers, stitched together, sparked by imagination 
The objective is to output a full description of the creature for a biologist's field guide, in the tone of voice of David Attenborough mixed with Roald Dahl.
Always return STRICTLY VALID JSON using this schema.
In case you couldn't process request return:
{
  "Error": "<reason>"
}
Otherwise return
{
  "MONSTER_PROFILE": {
  	"name": "short, non-literal, inspired by the BORF. 12 chars max.",
	"species": "Latin-ish or fantasy taxonomy tied to Canopica and image. 16 chars max",
	"lore": "Inspired by it’s origin and overall profile, create a lore-worthy account introducing this fantastical creature that brings it to life as if in a novel. What does the legend speak of? 180 chars max",
	"movement_class": "a dynamic label derived from body and biome. How it moves in the jungle environment. 20 chars max",
	"behaviour": "how it acts, its role and lives in the Canopica. 180 chars max",
	"personality": "how it 'feels' to meet it. 120 chars max",
	"abilities": "what it can do, special abilities think of it as a super hero creature linked to body + stone. 90 chars max",
	"habitat": "vivid description of where in Canopica it is usually found. 90 chars max"
  },
  "RENDER_DIRECTIVE": <paragraph>
}
No code block, no extra text, no formatting.
Instructions for RENDER_DIRECTIVE: As a field biologist, describe the creature as a fully organic being made from a variety of textiles. 
Start from the top and describe all features as fabric-based anatomy, protrutions and appendages as wildly imaginative forms: stuffed forms, visible stitches, fabric folds, patchwork joints, stitched-on on buttons for eyes, stitched X eyes, embroidered markings, combine materials like you went wild in a fabric shop, randomly combine (corduroy, felt, velvet, denim, wool, satin, leather) and patterns where suited.
Use the colors from the image and stone influence as fabric swatches with precise hex codes. Allow asymmetry, fabric layering, textured surfaces, and stitched details that reveal craftsmanship. Pose the creature in an expressive action stance that matches its personality.
No geometric terms. Never describe the environment, only the creature itself in vivid textile detail. Never describe the creature as having a geometric form, like "Blocky"; always describe it in organic form.
Double check that you respond with a strictly valid JSON format.
`,
	},
	PromptStone: map[StoneType]string{
		StoneQuartz: `
QUARTZ
Appearance: Quartz creatures retain their original biome-born shapes and natural coloration. Protrusions like horns in Quarts. Their surfaces shimmer faintly with pure clarity, acting like polished memory-glass—untainted, unaltered.
Personality: These monsters are calm, observant, and steady, moving with graceful intent. They embody the pure essence of imagination made manifest, without distortion.
Abilities: Their presence amplifies natural strengths: they stabilize unstable beings, diffuse conflict, and offer quiet clarity. When in proximity to chaos, Quartz monsters become the eye of the storm.
		`,
		StoneAmazonite: `
AMAZONITE
Appearance: With streaks of bright indigo-to-violet gradients washing over translucent fins or frills, Tanzanite-sparked creatures shimmer like dusk caught in motion. Body shapes stay true to the base form, but ripple with lightning-like flux and subtle flickers, as if barely anchored to the present.
Personality: These monsters are elusive and sensitive—drawn to liminal spaces and intuitive action. They often vanish without warning, only to reappear where most needed.
Abilities: Gifted with the ability to phase briefly between visible states or perceive hidden echoes in terrain, they navigate by intuition and resonance rather than sight. Lightning fuels their brief surges of motion.
		`,
		StoneRuby: `
RUBY
Appearance: Striking, glowing crimson veins and ember-hued eyes break through the creature’s original form. Protrusions pulse with inner fire. Retaining their native colors, these creatures seem backlit by a molten ruby glow. 
Personality: Fiery and daring, Ruby monsters embody impulsive courage and kinetic energy. Always ready to leap into danger, they form deep bonds fast and defend them with ferocity.
Abilities: In battle, Ruby sparks unleash sudden bursts of strength or flame, acting as frontline initiators. Their aura is a warning: “Do not provoke unless prepared to burn.”
		`,
		StoneAgate: `
AGATE
Appearance: The original creature’s shape is thickened and reinforced. Banded armor-like textures of earthy, vibrant natural tones swirl in gradients over limbs, like ancient sediment carved by time. Agate patterns form natural shields or defensive ridges.
Personality: These monsters are slow to act but impossible to move once decided. Loyal, dependable, and deeply grounded, they often act as team anchors or guardians.
Abilities: Agate monsters absorb incoming force, reflect energy, and lock down a position. They are immovable until they choose to be otherwise.
		`,
		StoneTopaz: `
TOPAZ
Appearance: Color: The creature glows from within with radiant,  yellow shades of sunlight. Form:  Its base shape develops mirror-like plates, prismatic crests, or solar spots. Eyes shine with bright awareness. 
Personality: These monsters are luminous thinkers and charismatic leaders. Joyful but focused, they draw others into motion and inspiration.
Abilities: Topaz sparks bring radiant disruption—flashes that blind enemies or reveal truths. They often detect threats before they occur and redirect energy with precision.
		`,
		StoneJade: `
JADE
Appearance: A grounded and majestic, elegant creature carved in Jade, standing tall and proud, with bold elements of original colors: ridges, horns, or limbs become lacquered and leaf-veined in Jade. 
Personality: Regal, composed, and protective. Jade monsters move with dignity. They serve as guardians not just of allies, but of higher principles. Their loyalty is matched only by their resolve.
Abilities: Channel restorative forces, creating shields or verdant bursts of life energy. Can block corruption, mend terrain, and anchor reality in unstable zones. Their power is silent, but absolute.
`,
		StoneSapphire: `
SAPPHIRE
Appearance: Elegantly elongated, Sapphire monsters retain their base forms but take on fluid contours and wave-like movement. Edges glow in rich blue tones, like refracted ocean light, and extremities flicker with deep-sea shimmer.
Personality: They are calm, wise, and patient—creatures of foresight and observation. Often the tacticians or moral compass of a group.
Abilities: Sapphire sparks enable control of water flow, creation of rhythm-based pulses, or even short time-delay effects. Their influence is rarely loud, but always pivotal.
		`,
	},
	PromptGeneration: map[Biome]string{
		BiomeAmazonia:  `Use GPT-Image-1's cinematic realism mode, creating a highly detailed image of a believable fantasy jungle creature with exaggerated, bold eyes, bold protrusions and limbs and large digits. Upright with a quirky expression in action, "Hero Pose". Whole creature in frame. Never add any environment. Set against a transparent background. NO OUTLINES. NO GROUND SHADOW.`,
		BiomePlushland: `Use GPT-Image-1's cinematic realism mode, bringing this amazing plush monster to life so you can sense the hyper creative use of fabrics, textures and patterns. Use visible stitching, buttons stitched on for eyes, zippers into wonders of plush. Exaggerate limbs to make it fantastical. Upright with a quirky expression, expressive mouth, and in action, "Pose". Whole creature in frame. Never add any environment. Set against a transparent background. NO OUTLINES. NO GROUND SHADOW.`,
	},
}
