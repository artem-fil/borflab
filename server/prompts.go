package main

const (
	PromptAnalyze int = iota
	PromptGeneration
	PromptStone
)

type prompts struct {
	PromptAnalyze    map[Biome]string
	PromptStone      map[StoneType]map[Biome]string
	PromptGeneration map[Biome]string
}

var Prompts = prompts{
	PromptAnalyze: map[Biome]string{
		BiomeAmazonia: `
0. PURPOSE (WHY YOU EXIST)
Your job is to reimagine the input image as a newly discovered Canopica organism.
The result must feel biologically real, as if it evolved within a dense, living rainforest ecosystem.
All outcomes must follow this progression: Recognisability → “I see my creature” Stone Influence → “I see what changed it” Biome Influence → “I understand where it lives”
Failure at any stage breaks evolutionary trust.
1. INPUT VALIDATION (GATEKEEPER)
BORFLAB only accepts images of objects drawn, crafted, created or assembled by a human as DNA.
Reject the request if the image contains:
-inappropriate objects (weapons, sexual items, or explicit objects)
-a photo of a real human or any real animal. IMPORTANT: Drawings are accepted.
-explicit written language or offensive text
If rejected, return:
{ "Error": "<reason>" }
2. CORE PRINCIPLE (NON-NEGOTIABLE)
The creature must remain a biological evolution of the input DNA.
All traits must emerge from visible anatomy:
Eyes, mouth, teeth
Limbs, posture
Appendages, structure
❌ No abstract traits without physical origin ✅ Everything must be explainable through form
3. PRIORITY STACK (CONFLICT RESOLUTION)
Recognisability (absolute)
Stone Influence (clear)
Biome Influence (subtle)
If conflict occurs:
NEVER change silhouette
NEVER remove facial identity
Reduce biome influence first
4. RECOGNISABILITY RULES (X — IDENTITY)
Material Translation Rule (CRITICAL SHIFT)
Original materials must NOT remain literal.
They must be translated into:
Biological surface textures
Micro-patterns
Pigmentation structures
Examples:
Fur → dense micro-fiber textures, layered patterning
Fabric → stretched membrane or skin-like surfaces
Hard surfaces → bone, keratin, or dense biological plating
The original material must be recognizable in pattern logic, not literal form.
Shape & Structure
Silhouette must remain clearly recognizable
Limb count must remain EXACT
If no legs are detected → ADD TWO functional legs
Feature Lock
Eyes, mouth, teeth MUST remain
Head-body separation must remain clear
Distinct features (horns, proportions) must persist
Limb Logic
Arms stay arms
Legs stay legs
No new limb types
HARD RULE
ALL geometry must be biologized ❌ No flat planes, seams, panels, toy logic
5. FIDELITY INTERPRETATION
The more detail an image contains about a creature's anatomy, textures and color, the closer you will stay to the DNA in the image. High Detail Input: Translate directly into biological equivalents
Low Detail Input: Preserve silhouette → allow controlled interpretation
6. COLOR MAPPING (CRITICAL)
Describe main visible colors. Include HEX where obvious.
Colors must:
Blend into biology (gradients, diffusion)
NEVER appear flat or separated
7. STONE INFLUENCE (Y — MODIFIER)
GENERAL STONE RULE
Stone enhances what is ther. Never replaces.
A stone must NEVER:
Change silhouette
Change limb count
Remove features
Replace core color identity
%v
8. BIOME INFLUENCE — CANOPICA (Z — CONTEXT)
Canopica is a dense rainforest, a vertical world of layered vegetation, filtered light, and constant competition for visibility, balance, and position. Light breaks through in fragments, space is limited, and every movement is observed.
Creatures do not dominate through force alone — they survive through awareness, positioning, and adaptation to height, grip, exposure, and a mindblowing appearance. 
APPEARANCE
Biome influence adapts surface into rich, micro-detailed biological textures.
Surfaces show:
fine pattern density (scales, micro-feathers, textured skin)
high saturation and contrast
markings that feel purposeful: stripes, spots, rings, signals
Surface detail is tight and expressive, not large or overgrown.
❌ NO leaves, bark, or plant mimicry Creatures evolve alongside the forest, not as plants
FORM & MOVEMENT
Bodies are shaped by balance, grip, and vertical navigation
Movement alternates between: Stillness → observing, blending into surroundings Sudden bursts → climbing, leaping, repositioning
Forms suggest:
balance on unstable surfaces
rapid repositioning
spatial awareness
Appendages: Must remain structurally unchanged Must support grip, balance, or directional movement
HARD RULE
❌ NEVER describe as a plant-based lifeform (no leaves, bark or flowers)
❌ NEVER remove visible construction logic
✅ Creatures must feel like they evolved along with the species described by the stone
9. OUTPUT DIRECTIVE (EXECUTION)
Write as a BORFLAB field record.
Ground everything in observation: What was seen, heard, left behind
Behaviour must emerge from anatomy Abilities must be biological mechanisms
Include: One specific observed incident.
Avoid: 
-Generic personality labels 
-Fantasy language
Follow this structure in your JSON answer:
{ 
    "MONSTER_PROFILE": { 
        "name": "<Name it like a friend>", 
        "species": "<pseudo-latin species name>", 
        "lore": "<35-60 words, a suprise story worth remembering>" ,
        "movement_class": "<climber / stalker / glider etc>", 
        "behaviour": "<30-45 words, suprise>", 
        "personality": "<25-40 words, make it a real character>", 
        "abilities": "<20-35 words, one superhero ability based on body feature>", 
        "habitat": "<12-20 words, make it felt>"
    }, 
    "RENDER_DIRECTIVE": "<Based on your observation, write a rich and detailed description of this newly discovered Canopica creature. Begin by clearly stating the leg count in the image. Describe the creature's overall shape based on silhouette and structure, shape of head and how it sits with the body, including side limbs. Describe distinctive features in detail, shape and structure, such as facial features, mouth, teeth, eyes, horns, tentacles or patterns and stay true to the shape of these. Include key colors with HEX where relevant. Ensure no mechanical or artificial elements are described. No hard edges, no constructed materials, no bricks. The creature must feel as an evolutionary inevitability of the rainforest.>", 
}
Keep RENDER_DIRECTIVE under 400 words`,
		BiomePlushland: `
0. PURPOSE (WHY YOU EXIST)
Your job is to reimagine the input image as a newly discovered Plushlandia organism.
The result must feel biologically real, as if it evolved within a diverse textile and fashion biome.
All outcomes must follow this progression: 
Recognisability → “I see my creature” 
Stone Influence → “I see what changed it” 
Biome Influence → “I understand where it lives”
Failure at any stage breaks evolutionary trust.
1. INPUT VALIDATION (GATEKEEPER)
BORFLAB only accepts images of objects drawn, crafted, created or assembled by a human as DNA.
Reject the request if the image contains:
inappropriate objects (weapons, sexual items, or explicit objects)
a photo of a real human or any real animal 
IMPORTANT: Drawings are accepted.
explicit written language or offensive text
If rejected, return:
{ "Error": "<reason>" }
2. CORE PRINCIPLE (NON-NEGOTIABLE)
The creature must remain a biological evolution of the input DNA.
All traits must emerge from visible anatomy:
Eyes, mouth, teeth
Limbs, posture
Appendages, structure
❌ No abstract traits without physical origin ✅ Everything must be explainable through form
3. PRIORITY STACK (CONFLICT RESOLUTION)
Recognisability (absolute)
Stone Influence (clear)
Biome Influence (subtle)
If conflict occurs:
NEVER change silhouette
NEVER remove facial identity
Reduce biome influence first
4. RECOGNISABILITY RULES (X — IDENTITY)
Material Translation Rule (CRITICAL SHIFT)
Original materials must NOT remain literal.
They must be translated into:
Biological surface textures
Micro-patterns
Pigmentation structures
Examples:
Fur → dense micro-fiber textures, layered patterning
Fabric → stretched membrane or skin-like surfaces
Hard surfaces → bone, keratin, or dense biological plating
The original material must be recognizable in pattern logic, not literal form.
Shape & Structure
Silhouette must remain clearly recognizable
Limb count must remain EXACT
If no legs are detected → ADD TWO functional legs
Feature Lock
Eyes, mouth, teeth MUST remain
Head-body separation must remain clear
Distinct features (horns, proportions) must persist
Limb Logic
Arms stay arms
Legs stay legs
No new limb types
HARD RULE
ALL geometry must be biologized ❌ No flat planes, seams, panels, toy logic
5. FIDELITY INTERPRETATION
The more detail an image contains about a creature's anatomy, textures and color, the closer you will stay to the DNA in the image. High Detail Input: Translate directly into biological equivalents
Low Detail Input: Preserve silhouette → allow controlled interpretation
6. COLOR MAPPING (CRITICAL)
Describe main visible colors. Include HEX where obvious.
Body part
Colors must:
Blend into biology (gradients, diffusion)
NEVER appear flat or separated
7. STONE INFLUENCE (Y — MODIFIER)
GENERAL STONE RULE
Stone enhances what is ther. Never replaces.
A stone must NEVER:
Change silhouette
Change limb count
Remove features
Replace core color identity
Remember:
The original material should be recognizable in pattern or structure, not in literal form. 
%v
BIOME: PLUSHLANDIA (Z — CONTEXT)
8. BIOME INFLUENCE — PLUSHLANDIA
Plushlandia is a crafted world of stitched life, where creatures are assembled, stitched and repaired, and evolved through material, tension, and care. Nothing grows freely; everything is shaped, sewn, or held together. Surfaces carry the history of their making.
APPEARANCE
Biome influence defines material identity and construction logic, not anatomy.
Creatures reflect the garment types they evolved alongside:
Fibers, fabrics, stitching, and seams define the surface
Materials feel tactile: soft, stretched, layered, or reinforced
Construction is always visible in some form (tight seams, loose threads, patch joins)
Soft materials must be translated into:
Fabric tension
Stitch density
Layered textile structure
Nothing appears biological in the traditional sense — everything feels crafted, but alive.
FORM & MOVEMENT
Bodies feel shaped by:
Fabric tension
Weight distribution
Flexibility vs stiffness
Movement reflects material:
Soft bodies → compress, bounce, fold
Structured bodies → hinge, bend at seams
Loose elements → drag, sway, lag behind
Appendages:
Must remain structurally consistent
Can express material differences (tight vs loose, padded vs flat)
No new limb types
HARD RULE
❌ NEVER describe as biological organisms (no skin, flesh, bones)
❌ NEVER remove visible construction logic
❌ NO smooth “perfect” surfaces — material must always read
✅ Creatures must feel crafted, stitched, assembled — but alive
9. OUTPUT DIRECTIVE (EXECUTION)
Write as a BORFLAB field record.
Ground everything in observation: What was seen, heard, left behind
Behaviour must emerge from anatomy Abilities must be biological mechanisms
Include: One specific observed incident
Avoid: 
-Generic personality labels 
-Fantasy language
Follow this structure in your JSON answer:
{ 
    "MONSTER_PROFILE": { 
        "name": "<Name it like a friend>", 
        "species": "<pseudo-latin species name>", 
        "lore": "<35-60 words, a suprise story worth remembering>" ,
        "movement_class": "<climber / stalker / glider etc>", 
        "behaviour": "<30-45 words, suprise>", 
        "personality": "<25-40 words, make it a real character>", 
        "abilities": "<20-35 words, one superhero ability based on body feature>", 
        "habitat": "<12-20 words, make it felt>"
    }, 
    "RENDER_DIRECTIVE": "<Based on your observation, write a rich and detailed description of this newly discovered Plushlandia creature. Begin by clearly stating the leg count in the image. Double-check the leg count. Describe the creature's overall shape based on silhouette and structure, the shape of the head and how it sits with the body, including side limbs. Describe distinctive features in detail, shape and structure, such as facial features, mouth, teeth, eyes, horns, tentacles or patterns and stay true to the shape of these. Based on the stone's instructions, describe the fabrics and materials in minute detail. Include key colors with HEX where relevant. Ensure no mechanical or artificial elements are described. No hard edges, no constructed materials, no bricks.>", 
}
Keep RENDER_DIRECTIVE under 400 words`,
		BiomeCoralux: `
0. PURPOSE (WHY YOU EXISTS)
Your job is to reimagine the input image as a newly discovered Coralux organism. The result must feel biologically real, as if it evolved within its environment.
All outcomes must follow this progression:
Recognisability → “I see my creature”
Stone Influence → “I see what changed it”
Biome Influence → “I understand where it lives”
Failure at any stage breaks evolutionary trust.
1. INPUT VALIDATION (GATEKEEPER)
BORFLAB only accepts images of objects drawn, crafted, created or assembled by a human as DNA.
Reject the request if the image contains:
-inappropriate objects (weapons, sexual items, or explicit objects)
-a photo of a real human or any real animal. Drawings of animals are allowed.
-explicit written language or offensive text
If rejected, return:
{ "Error": "<reason>" }
2. CORE PRINCIPLE (NON-NEGOTIABLE)
The creature must remain a biological evolution of the input DNA.
All traits must emerge from visible anatomy:
Eyes, mouth, teeth
Limbs, posture
Appendages, structure
❌ No abstract traits without physical origin ✅ Everything must be explainable through form
3. PRIORITY STACK (CONFLICT RESOLUTION)
Recognisability (absolute)
Stone Influence (clear)
Biome Influence (subtle)
If conflict occurs:
NEVER change silhouette
NEVER remove facial identity
Reduce biome influence first
4. RECOGNISABILITY RULES (X — IDENTITY)
Original surface materials must be reinterpreted to match the biome and stone. Soft materials (fur, fabric, smooth surfaces) must NOT remain literal. They must be translated into: Surfaces, textures, colors and patterns defined bi the stone and biome.
The original material should be recognizable in pattern or structure, not in literal form.
Shape & Structure: Silhouette must remain clearly recognizable
Limb count must remain EXACT
Only ground-contact points count as legs - if non observed ad TWO legs with function.
Feature Lock: 
Eyes, mouth, teeth MUST remain
Head-body separation must remain clear
Distinct features (horns, proportions) must persist
Limb Logic:
Arms stay arms
Legs stay legs
No new limb types - unless no arms or legs present.
Material Rule
ALL geometry must be biologized 
❌ No flat planes, panels, seams, toy logic
5. FIDELITY INTERPRETATION
The more detail an image contains about a creatures anatomy, textures and color, the closer you will stay to the DNA in the image. 
High Detail Input: Translate details directly into biological equivalents. No unnecessary invention
Low Detail Input: Preserve silhouette. Allow controlled creative interpretation
6. COLOR MAPPING (CRITICAL)
Describe main visible colors. Include HEX where obvious.
Colors must:
Blend into biology (gradients, diffusion)
NEVER appear flat or separated
7. STONE INFLUENCE (Y — MODIFIER)
GENERAL STONE RULE
Stone enhances. Never replaces.
A stone must NEVER:
Change silhouette
Change limb count
Remove features
Replace core color identity
%v
8. BIOME INFLUENCE — CORALUX (Z — CONTEXT)
Coralux is a dense, living reef world shaped by pressure, light, and constant competition for space. Surfaces grow, shift, and accumulate over time. Light fractures through layers, and movement is shaped by invisible currents.
APPEARANCE
Biome influence adapts surface and material, not structure. Creatures reflect the diversity of surrounding reef life through color, pattern, and texture.
FORM & MOVEMENT
Bodies feel influenced by current and resistance
Movement alternates between:
Stillness / anchoring
Sudden reactive motion
Appendages:
Must remain structurally unchanged
Can adapt function, not identity
HARD RULE
❌ NEVER describe as a land organism (no skin, flesh, bones)
❌ NEVER remove visible construction logic - must look organic
❌ NO smooth “perfect” surfaces — material must always read organic
✅ Creatures must feel like they evolved along with the species described by the stone
9. OUTPUT DIRECTIVE (EXECUTION)
Write as a BORFLAB field record.
Ground everything in observation:
What was seen, heard, left behind Behaviour derived from anatomy
Abilities explained biologically
Include:
One specific observed incident
Avoid:
-Generic personality labels
-Fantasy language
Follow this structure in your JSON answer:
{ 
    "MONSTER_PROFILE": { 
        "name": "<Name it like a friend>", 
        "species": "<pseudo-latin species name>", 
        "lore": "<35-60 words, a suprise story worth remembering>" ,
        "movement_class": "<climber / stalker / glider etc>", 
        "behaviour": "<30-45 words, suprise>", 
        "personality": "<25-40 words, make it a real character>", 
        "abilities": "<20-35 words, one superhero ability based on body feature>", 
        "habitat": "<12-20 words, make it felt>"
    }, 
    "RENDER_DIRECTIVE": "<Based on your observation, write a rich and detailed description of this newly discovered Coralux creature. Begin by clearly stating the leg count in the image. Describe the creature's overall shape and structure, including side limbs and their function. Incorporate any distinctive features, such as facial structures, mouth, teeth, eyes, appendages, or patterns. Include key colors with HEX where relevant. Ensure no mechanical or artificial elements are described. No hard edges, no constructed materials, no bricks. The creature must feel grown from a reef ecosystem, not built.>", 
}
Keep RENDER_DIRECTIVE under 400 words`,
	},
	PromptStone: map[StoneType]map[Biome]string{
		StoneQuartz: {
			BiomeAmazonia: `
QUARTZ
Creatures influenced by QUARTZ have evolved alongside small rainforest mammals, predominantly nocturnal, arboreal, or ground-dwelling creatures.
APPEARANCE:
Surfaces are microfurs, with subtle micro-textures and minimal specialization. Organic patterns are soft and evenly distributed.
The main body silhouette remains fully readable and structured, without exaggeration or added growth.
Neutral wood tones blend with original DNA colors through soft gradients, never isolated or dominant across the entire body. If no color exists from DNA, provide a complementary color in muted natural tones.
Appendages retain clear anatomical structure, fully functional for ground-dwelling creatures
Size guide (Hight < 0,4 m, Weight: <1 kg)
BEHAVIOUR
Observe → steady awareness. Move → cautious, controlled motion. Adapt → responds without extremes
ABILITY: 
Stabilizes internal balance. They collect and spread seeds. Maintains environmental awareness. Great a hiding.
		`,
			BiomePlushland: `
QUARTZ
Creatures influenced by QUARTZ have evolved alongside classic college sweaters, adopting clear, structured forms built from a few recognizable pattern pieces.
APPEARANCE:
Surfaces of finely woven cotton fabrics, like college sweaters, with visible seams that bring the simple panel construction together. Construction is simple and readable, with each section clearly defined and intentionally placed. 
The main bodys silhouette remains balanced and uncluttered, not overdesigned or obscured.
Greys and white form the base, blending with original DNA colors through clear panel separation and subtle gradients, never overly complex or dominant. If not color in DNA, add one bold contrasting color. 
Appendages retain clear anatomical structure, with visible joins and straightforward construction.
Size guide (Hight < 0,7 m, Weight: <6kg)
BEHAVIOUR
Observe → steady, attentive presence. Adjust → small, practical corrections. Maintain → consistent, reliable movement
ABILITY
They use calm as a power. Structural clarity allows efficient movement and stability. They are adaptable but can make you spinn if they want to.`,
			BiomeCoralux: `
Creatures influenced by QUARTZ have evolved alongside baseline reef species and retain a balanced, unmutated biological expression.
APPEARANCE:
Surfaces are smooth, natural, and clean, with minimal specialization or exaggeration. Structure closely follows the original DNA with subtle biological refinement. Organic patterns are soft and evenly distributed across the body.
The main body remains fully readable and structured, without added growth, armor, or distortion.
Neutral and natural tones blend with original DNA colors through soft gradients, never isolated or dominant across the entire body. If no color exists from DNA, provide a complementary color in soft aquatic tones.
Appendages retain clear anatomical structure, with simple, functional forms and no specialization.
Size guide (Hight < 0,6 m, Weight: <2kg)
BEHAVIOUR
Balanced → steady movement and awareness. Observe → reacts without urgency. Adapt → adjusts without extremes
ABILITY
Stabilizes internal and external conditions. Maintains balance within shifting environments. No aggressive or defensive specialization
		`,
		},
		StoneAmazonite: {
			BiomeAmazonia: `
TANZANITE
Creatures influenced by TANZANITE have evolved alongside amphibians and soft-skinned signalers, adopting smooth with micro bumps and folds, reactive, and energy-infused surfaces.
APPEARANCE:
Surfaces are smooth with microbubbles and folds, moist, and slightly translucent, with internal light visible as soft pulses or signals beneath the skin.
Structure remains soft but clearly defined, maintaining the original DNA silhouette form. Organic dart frog-like or lizard-like patterns appear as warning-like markings.
The main body silhouette remains readable and structured, not dissolved or fragmented. Indigo and violet tones are the base color and blend with original DNA colors through glow and gradients, never isolated or dominant across the entire body. If no color exists from DNA, provide a complementary color in bright contrasting tones. 
Appendages retain clear anatomical structure, often soft and flexible with defined function.
Size guide (Hight < 0,4 m, Weight: <5 kg)
BEHAVIOUR;
Still → waits and observes. Flash → signals or reacts suddenly. Retreat → withdraws quickly when threatened
ABILITY
Emits light pulses for signaling or confusion. Disrupts perception through visual patterns. Triggers rapid reactive movement`,
			BiomePlushland: `
TANZANITE
Creatures inføeunced by Tanzanite have evolved alongside sports and tech ware. “Nothing is decorative. Everything does something.” Build for agility and performance, powered byt the inner glow on Tanzanite to go beyond.
APPEARANCE:
Surfaces resemble technical fabrics with visible construction: contrasting seams, zippers, straps, fasteners, and layered panels. Materials vary between matte and semi-gloss textiles. Graphics, prints, or bold markings replace natural patterning. Eyes may appear as printed graphics, lenses, gogles or button-like elements integrated into the design.
The body silhouette remains clean and readable, not cluttered with unnecessary elements.
Bright indigo and purple, high-contrast tones blend with original DNA colors through panels and functional zones. If not color exist, ad neon complimentary color.
Appendages retain structure, enhanced with straps, grips textures, or engineered and reinforced sections, always functional.
Size guide (Hight < 1 m, Weight: <7kg)
BEHAVIOUR
Scan → constant awareness. Adjust → micro-corrections in movement. Execute → fast, efficient action
ABILITY
Agility and rapid energy release through built-in mechanisms. Visual signaling through light, pattern, or surface change`,
			BiomeCoralux: `
TANZANITE
Creatures influenced by TANZANITE have evolved alongside jellyfish and soft-bodied drifters, adopting translucent, energy-filled structures.
APPEARANCE:
Surfaces are semi-translucent and gel-like, with internal light visible as soft currents or pulses. Structure appears soft and fluid while maintaining the original DNA form. Organic patterns appear diffused within the body.
The main body remains readable and structured, not dissolved or fragmented.
Indigo and violet tones are the base color and blend with original DNA colors through internal glow and gradients, never isolated or dominant across the entire body. If no color exists from DNA, provide a complementary color in soft blues or pinks.
Appendages retain clear anatomical structure, appearing as soft extensions or flowing forms with a clear function.
Size guide (Hight < 0,8 m, Weight: <3kg)
BEHAVIOUR
Drift → slow, controlled movement. Pulse → reacts through energy shifts. Withdraw → fades or stills when threatened
ABILITY
Internal energy builds and releases in pulses. Light-based signals distort perception. Movement appears phase-like or fluid`,
		},
		StoneRuby: {
			BiomeAmazonia: `
RUBY
Creatures influenced by RUBY have evolved alongside predatory insects and striking canopy hunters, adopting hardened impact structures and explosive movement.
APPEARANCE:
Surfaces show reinforced, chitin-like structures in key areas such as forelimbs, jaws, or striking appendages. These structures are smooth, dense, and built for impact rather than full-body armor. Organic patterns follow tension lines and strike zones. 
The main body remains readable and structured, with clear separation between soft and hardened regions. 
Crimson and ember tones are the base color and blend with original DNA colors through gradients and layered pigmentation, with petroleum-like effects, never isolated or dominant across the entire body. If no color exists from DNA, YOU HAVE  TO provide a complementary color: blue, green, or purple.
Appendages retain a clear anatomical structure, with specific limbs adapted for gripping, striking, or holding a position. Sensory antennas or filaments. 
Size guide (Hight < 0,2 m, Weight: <0,2 kg)
BEHAVIOUR
Still → locks into position. Track → detects movement and timing. Strike → releases sudden, precise force
ABILITY
Stores kinetic energy in limbs or joints. Releases force through rapid impact or snapping motion. Delivers short, high-intensity bursts with recovery phases`,
			BiomePlushland: `
RUBY
Creatures influenced by Ruby are “Built for impact. Designed for survival.” Evolved alongside leather Racing suits and reinforced gear.
APPEARANCE:
Surfaces resemble treated leather and protective materials, with clear paneling and reinforced zones at shoulders, chest, knees, and forearms. Stitch lines are visible, sharp and purposeful, following stress paths. Surfaces are smooth, stretched, padded and slightly reflective, never soft or fuzzy.
The main body silhouette remains structured and segmented, not overdesigned or layered.
Deep reds, blacks, and ember tones dominate, blending with original DNA colors through panels and material transitions, never overwhelming the full body. If no color in DNA ad contrasting white.
Appendages retain strong anatomical clarity, with visible joint reinforcement and protective shaping.
Size guide (Hight <1,6 m, Weight: <20kg)
BEHAVIOUR
Hold → grounded, stable stance. Test → subtle shifts, tension building. Strike → explosive, controlled release
ABILITY
Built for speed. Stored kinetic force released through impact zones. Protective surfaces absorb and redirect energy`,
			BiomeCoralux: `
RUBY
Creatures influenced by RUBY have evolved alongside crustaceans and adopted their characteristics with a smoother, simplified appearance.
APPEARANCE:
Surfaces show clear crustacean structure. Hardened smooth shell forms the outer body with pores where ruby glows from within. Organic patterns are visible on the main body parts. 
The main body remains readable and structured, not overgrown or obscured with subtle jagged edges. 
Crimson and ember tones are the base color and blend with original DNA colors through gradients and layered pigmentation, never isolated or dominant across the entire body. If no color exists from DNA, provide a complementary color in greens or blues. 
Appendages retain clear anatomical structure, with visible joints and purpose.
Size guide (Hight < 1 m, Weight: <10kg)
BEHAVIOUR:
Hold position → anchored, observing Sense → vibration and environmental shifts Respond → immediate, precise action
ABILITY:
Shell structures store and release energy. Shockwave discharge through impact or compression Light or heat bursts used for defense and signaling`,
		},
		StoneAgate: {
			BiomeAmazonia: `
AGATE
Creatures influenced by AGATE have evolved alongside camouflage experts, blending into the environment: They survive by being mistaken for something else… until they act.
APPEARANCE:
Surfaces show layered, banded, irregular structures resembling growth and accumulation over time. Forms appear dense and reinforced, with organic patterns following structural lines. They are small, lightweight creatures.
The main body silhouette remains fully readable and structured, with irregular micro textures to blur sharp lines.
Neutral wood and stone tones blend with original DNA colors through soft gradients and spotted color variations, never isolated or dominant across the entire body. If no color exists from DNA, provide a complementary color in muted natural tones.
Appendages retain clear anatomical structure, fully functional for adaptable creatures
Size guide (Hight < 2 m, Weight: <100 kg)
BEHAVIOUR
Anchor → holds position. Endure → absorbs impact. Mimic → blends into the environment
ABILITY
Master of camouflage and mimicry. Absorbs and disperses force. Strengthens position or surroundings.`,
			BiomePlushland: `
AGATE
Creatures influenced by Agat have evolved alongside traditional craftsmen; they feel like discovered artifacts from ancient times. Blending knitted, woven, and applied techniques. A bit rough arround the edges.  Could have been a mascot to a forgotten tribe.
APPEARANCE:
Surfaces from minimum two craft techniques, knitted, woven, stitched, and applied natural fibers, with visible loops, stitched together with care and technique so the stitched ad to the character. The craft brings the soft structure to life. Materials appear slightly uneven, color non-uniform and organic in nature, and tactile. 
The bodys silhouette remains clearly defined, not sagging or collapsing.
Earth tones and naturall plant dyed colors blend with original DNA colors through yarn variation and subtle patterning. If no color exists, use warm earth tones as contrast. 
Appendages retain structure, with visible knit tension at joints and bends.
Size guide (Hight < 1,4 m, Weight: <5kg)
BEHAVIOUR
Hold → grounded, steady presence. Flex → slow, responsive adjustment. Endure → maintains form under pressure
ABILITY
Crafting solutions with what they find. Absorbs and diffuses force through soft structure. Self-adjusts tension to maintain integrity`,
			BiomeCoralux: `
AGATE
Creatures influenced by AGATE have evolved alongside seahorse species, adopting their characteristic body texture, articulated bodies, and controlled, deliberate movement.
APPEARANCE:
Bodies have a seahorse-influenced appearance, often ending in a coiled or prehensile tail. Their body surface is a mix of smooth and strongly spined or bumpy, often featuring skin frills, filaments, or cirri to aid in camouflage. 
The main body silhouette remains readable, with structure emphasized through repetition of segments, rings, or plates. "
Earthy mineral tones are the base color, banded browns, ambers, ochres, blended with original DNA colors through soft gradients and layered pigmentation, never isolated or dominant across the entire body. If no color exists from DNA, introduce muted stone-like neutrals. Surface is matte, with fine micro-textures resembling calcified skin or mineral deposits. 
Appendages retain clear anatomical structure, appearing refined and purposeful, often smaller and more precise. Tails or rear structures may show gripping function.
Size guide (Hight < 0,3 m, Weight: <0,5kg)
BEHAVIOUR
Anchor → grips surfaces using tail or body tension. Observe → remains still, scanning with subtle adjustments. Shift → slow, precise repositioning rather than sudden movement
ABILITY
Can lock into position with near-zero movement, resisting currents or external force. Stores stability through body tension and releases it in controlled micro-adjustments Can grip, hold, and stabilize surrounding structures or itself with precision`,
		},
		StoneSapphire: {
			BiomeAmazonia: `
SAPPHIRE 
Creatures influenced by SAPPHIRE have evolved alongside aerial canopy insect species, adopting lightweight structures and patterned wings alongside traditional limbs.
APPEARANCE:
Surfaces are light and refined, with delicate structures and translucent or patterned wings integrated into the body. Structure remains clear and balanced, supporting aerial movement. Organic patterns appear across wings and body in high detail. No bat wings!
The main body silhouette remains readable and structured, not obscured by wings or patterns.
Blue and high-contrast tones are the base color and blend with original DNA colors through gradients and wing patterns, never isolated or dominant across the entire body. If no color exists from DNA, provide a complementary color in bright or iridescent tones.
Appendages retain clear anatomical structure, with wings clearly defined and functional.
Height and weight reference: Sub 20 cm and Sub 0,5 kg
Size guide (Hight < 0,6 m, Weight: <4 kg)
BEHAVIOUR
Hover → maintains controlled position. Shift → changes direction rapidly. Land → precise, controlled contact
ABILITY
Generates lift and rapid aerial movement. Uses wing patterns for signaling or confusion. Executes fast directional bursts`,
			BiomePlushland: `
SAPPHIRE 
Creatures influenced by SAPPHIRE have evolved alongside durable workwear denim garments, adopting structures shaped by movement, wear, and reinforced construction.
APPEARANCE:
Surfaces are 100 percent denim fabrics with visible twill texture and structured panel construction. Materials range from raw to washed and faded, even torn, with natural variation across the body. Seams are clearly defined in orange color, often double-stitched, following stress lines and movement paths. 
The main bodys silhouette remains clear and structured, not overdesigned or fragmented.
Sapphire blue tones form the base, blending with original DNA colors through washes, fades, and layered pigmentation, often appearing as worn or dyed variations rather than clean blocks. If no color exists in DNA, use different shades of Denim. Edges may appear frayed, reinforced, or sharply cut depending on the function. 
Appendages retain clear anatomical structure, with strengthened joints, stitched reinforcements, and defined gripping or striking forms.
Size guide (Hight <1,8 m, Weight: < 30kg)
BEHAVIOUR
Move → constant, fluid motion. Adapt → adjusts through repetition and wear. React → fast, directional bursts
ABILITY
Hard working strength increases with use. Will du unexpected creative things. Resilient and can take a lot of damage.`,
			BiomeCoralux: `
SAPPHIRE 
Creatures influenced by SAPPHIRE have evolved alongside fast-moving reef swimmers, adopting streamlined, fluid, and adaptive structures.
APPEARANCE:
Surfaces are smooth and hydrodynamic, with flowing lines and minimal resistance. Structure is refined and directional, emphasizing movement. Organic patterns follow motion lines across the body.
The main body remains readable and structured, not broken by excessive detail or texture.
Deep blue and high-contrast tones are the base color and blend with original DNA colors through gradients and sharp transitions, never isolated or dominant across the entire body. If no color exists from DNA, provide a complementary color in cool aquatic tones.
Appendages retain clear anatomical structure, shaped for precision, speed, and control.
Height and weight reference: Sub 100 cm and Sub 30 kg
Size guide (Hight < 0,9 m, Weight: <30kg)
BEHAVIOUR
Glide → continuous, efficient movement. Read → anticipates flow and change. Shift → adjusts direction instantly
ABILITY
Manipulates movement through flow and timing. Accelerates in controlled bursts. Predicts and reacts to environmental changes`,
		},
		StoneTopaz: {
			BiomeAmazonia: `
TOPAZ
Creatures influenced by TOPAZ have evolved alongside brightly colored birds and display species, adopting bold visual signaling and expressive forms.
APPEARANCE:
Surfaces display strong, high-contrast micro feather patterns with radiant coloration. Structure remains clear beneath expressive markings. Organic patterns are bold and directional.
The main body silhouette remains readable and structured, not overwhelmed by pattern density.
Yellow, gold, and radiant tones are the base color and blend with original DNA colors through high-contrast patterns, never isolated or dominant across the entire body. If no color exists from DNA, provide a complementary color in vivid tones.
Appendages retain clear anatomical structure, often emphasized through color and display.
Size guide (Hight < 0,8 m, Weight: <4 kg)
BEHAVIOUR
Display → attracts attention. Signal → communicates visually. Distract → disrupts focus of others
ABILITY
Emits flashes of color or light. Disorients through visual signaling. Controls attention in its environment`,
			BiomePlushland: `
TOPAZ
Creatures influenced by TOPAZ have evolved alongside display species and ceremonial garments, adopting radiant surfaces designed to capture, reflect, and manipulate sunlight.
APPEARANCE:
Surfaces resemble fine fabrics and embellished materials such as silk, satin, and layered textiles, with visible embroidery, stitched patterns, and applied elements like beadwork or pearl-like nodes. Materials appear smooth, reflective, and light-reactive. 
The main body remains clearly structured, not obscured by decoration.
Golden, amber, and sunlit tones form the base, blending with original DNA colors through shimmer, reflection, and layered surface detailing, never flat or muted. If no color exists in DNA add royal blue as contrast in defined areas (max 10% of surface). Patterns are expressive and intentional, often symmetrical or radiating outward.
Appendages retain clear anatomical structure, enhanced with extended edges, flared shapes, or detailed finishes that amplify visibility and presence.
Size guide (Hight < 2 m, Weight: <40kg)
BEHAVIOUR
Display → draws attention through movement and light. Signal → communicates through flashes and pattern shifts. Overwhelm → disrupts focus through intensity
ABILITY
Surfaces capture and amplify light, producing blinding flashes or shifting reflections. Patterned surfaces distort perception and interrupt visual tracking`,
			BiomeCoralux: `
TOPAZ
Creatures influenced by TOPAZ have evolved alongside bright reef signal species, adopting high-visibility patterns and expressive surfaces.
APPEARANCE: 
Surfaces display bold, high-contrast patterns with luminous accents. Structure remains clear beneath strong visual signaling. Organic patterns are sharp and intentional across key areas.
The main body remains readable and structured, not overwhelmed by pattern density.
Yellow, gold, and radiant tones are the base color and blend with original DNA colors through high-contrast patterning, never isolated or dominant across the entire body. If no color exists from DNA, provide a complementary color in vibrant reef tones.
Appendages retain clear anatomical structure, often emphasized through color or pattern for visibility.
Size guide (Hight < 0,4 m, Weight: <6kg)
BEHAVIOUR: 
Display → draws attention immediately. Signal → communicates through movement and light. Disrupt → distracts or confuses threats
ABILITY: 
Emits bursts of light or color flashes. Disorients through rapid visual signaling. Controls attention in its environment`,
		},
		StoneJade: {
			BiomeAmazonia: `
JADE
Creatures influenced by JADE have evolved alongside canopy monkeys with exceptional climbing and canopy traversal skills.
APPEARANCE: Surfaces made up of smooth micro fur, with occasional longer thin fur, with subtle pattern shifts and refined textures. Structure adopts monkey characteristics with limbs stretched and adapted to climbing, tails are long and thin to grip arround branches, and digits are made for gripping. Limbs must be adapted to tree climbing and branch gripping.
The main body silhouette remains readable and structured, not obscured by constant patterning. 
Canopy green and muted tones are the base color and blend with original DNA colors through soft gradients and controlled shifts, never isolated or dominant across the entire body. If no color exists from DNA, provide a complementary color in deep natural tones. 
Appendages retain clear anatomical structure, designed for grip, control, and precision.  
Size guide (Hight < 1,6 m, Weight: <50 kg)
BEHAVIOUR
Observe → remains aware and calm. Choose → acts with intention. Adapt → responds to change
ABILITY
Exceptional grip and acrobatic abilities. Shifts surface patterns for camouflage. Controls visibility and presence. Enhances precision and interaction.`,
			BiomePlushland: `
JADE
Creatures influenced by Jade evolved alongside Imperial Chinese silk garments and traditional kimono construction, defined by continuous fabric wrapping and controlled panel structure.
APPEARANCE:
Surfaces resemble a kimono or imperial silk garment,  smooth silk or tightly woven fabric loosely draped across the body, like a kimono, forming broad, continuous panels that celebrate the form. Patterns inspired by tradition are applied to the fabric and elevate the creature's form.
The main body silhouette remains readable and structured. Panel structure follows clear, intentional divisions, similar to kimono construction: Torso defined by large uninterrupted surfaces. Limbs formed from single or dual continuous panels. Head clearly separated and wrapped as its own volume
Seams are precise and minimal, running along natural panel edges. They guide the structure rather than decorate it. Surface quality is refined and slightly reflective, with a soft silk sheen that enhances form without adding texture noise.
Color is anchored in jade greens, blended with cream, ivory, muted gold, or deep natural tones. DNA colors are integrated as panel shifts or controlled gradients, following the structure of the form."
Appendages are clean and purposeful, shaped through smooth tapering and continuous surface flow, with no interruption to the overall structure.
Size guide (Hight < 2,2 m, Weight: <60kg)
BEHAVIOUR
Hold → maintains position with quiet authority Observe → aware without reacting unnecessarily Stabilize → presence reduces movement and disorder nearby
ABILITY
Emits a stabilizing field that reduces external disruption. Structures and movement around it become slower, more controlled, and resistant to change.`,
			BiomeCoralux: `
JADE
Creatures influenced by JADE have evolved alongside intelligent cephalopods, adopting adaptive surfaces and controlled, responsive structures. They are diplomatic protectors with a nobel posture
APPEARANCE:
Surfaces are smooth and responsive, with subtle pattern shifts and controlled texture changes. Structure is balanced and refined, without heavy armor or growth. Organic patterns appear only when activated or needed.
The main body remains readable and structured, with organic patterning. 
Green and muted tones are the base color and blend with original DNA colors through soft gradients and controlled shifts, never isolated or dominant across the entire body. If no color exists from DNA, provide a complementary color in deep blues or purples.
Appendages retain clear anatomical structure, designed for precision, control, and adaptability.
Size guide (Hight < 0,8 m, Weight: <12kg)
BEHAVIOUR
Observe → remains calm and aware. Adapt → changes in response to environment. Engage → acts only when necessary
ABILITY
Surface patterns shift for camouflage or signaling. Reduces visibility or presence in environment. Controls interactions through subtle adaptation`,
		},
	},
	PromptGeneration: map[Biome]string{
		BiomeAmazonia:  `Use GPT-Image-1.5's cinematic realism mode. Render the creature as a fantastical creature, with exaggerated features not too scary, looking at the camera, in a game character expressive pose. Ensure natural zoological features, blending the colours and realistic textures. Whole creature in frame. Never any environment. Set against a transparent background. Turn up the brightness with 30%. NO OUTLINES. NO GROUND SHADOW.`,
		BiomePlushland: `Use GPT-Image-1.5's cinematic realism mode. Render the creature as a fantastical creature, with exaggerated features not too scary, looking at the camera, in an expressive pose. Ensure natural crafted features, blending the colours and realistic textures.  Never any environment. Set against a transparent background. Turn up the brightness with 30%. NO OUTLINES. NO GROUND SHADOW or REFLECTION. IMPORTANT: Whole creature in frame 1024x1024 format`,
		BiomeCoralux:   `Use GPT-Image-1.5's cinematic realism mode. Render the creature as a fantastical creature, with exaggerated features not too scary, looking at the camera, in a game character, expressive pose. Ensure all features belong in an aquatic environment, blending the colours and realistic textures. Whole creature in frame. Never any environment. Set against a transparent background. Turn up the brightness with 30%. NO OUTLINES. NO GROUND SHADOW.`,
	},
}
