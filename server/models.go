package main

import (
	"encoding/json"
	"math/rand"
	"time"

	"github.com/google/uuid"
)

var seasonLimits = map[Rarity]int{
	RarityCommon:    420000,
	RarityRare:      210000,
	RarityEpic:      109200,
	RarityMythic:    67200,
	RarityLegendary: 33600,
}

var stoneProbabilities = map[StoneType][5]int{
	StoneQuartz:    {50, 25, 13, 8, 4},
	StoneAmazonite: {45, 27, 14, 9, 5},
	StoneAgate:     {43, 26, 15, 10, 6},
	StoneRuby:      {40, 25, 16, 11, 8},
	StoneSapphire:  {35, 24, 18, 12, 11},
	StoneTopaz:     {32, 22, 19, 13, 14},
	StoneJade:      {30, 20, 20, 14, 16},
}

type Biome string

const (
	BiomeAmazonia  Biome = "amazonia"
	BiomeAquatica  Biome = "aquatica"
	BiomePlushland Biome = "plushland"
	BiomeCanopica  Biome = "canopica"
)

type Rarity string

const (
	RarityCommon    Rarity = "common"
	RarityRare      Rarity = "rare"
	RarityEpic      Rarity = "epic"
	RarityMythic    Rarity = "mythic"
	RarityLegendary Rarity = "legendary"
)

type StoneType string

const (
	StoneQuartz    StoneType = "Quartz"
	StoneAmazonite StoneType = "Amazonite"
	StoneAgate     StoneType = "Agate"
	StoneRuby      StoneType = "Ruby"
	StoneSapphire  StoneType = "Sapphire"
	StoneTopaz     StoneType = "Topaz"
	StoneJade      StoneType = "Jade"
)

type RarityStats struct {
	CommonIssued    int
	RareIssued      int
	EpicIssued      int
	MythicIssued    int
	LegendaryIssued int
}

type User struct {
	PrivyId string
	Email   string
	Wallets []string
	Created time.Time
	Synced  time.Time
}

type Experiment struct {
	Id     int
	UserId string

	InputMime   string
	InputSize   int
	InputWidth  int
	InputHeight int

	ProcessedMime   string
	ProcessedSize   int
	ProcessedWidth  int
	ProcessedHeight int
	ProcessedImage  []byte

	Specimen    json.RawMessage
	ImageCID    string
	MetadataCID string
	Metadata    json.RawMessage
	Stone       StoneType
	Biome       Biome
	Rarity      Rarity

	Created   time.Time
	Analyzed  *time.Time
	Generated *time.Time
	Uploaded  *time.Time
	Minted    *time.Time
}

type Stone struct {
	Id           int
	UserId       string
	MintAddress  string
	OwnerAddress string
	SparkCount   int
	Type         StoneType
	PdaAddress   string
	Signature    string
	Slot         int64
	Minted       time.Time
	Created      time.Time
}

type StoneStats struct {
	MintAddress *string
	Type        StoneType
	SparkCount  int
}

type Monster struct {
	Id           int
	UserId       string
	ExperimentId int

	// === solana stuff ===
	Signature        string
	Slot             int64
	MintAddress      string
	OwnerAddress     *string
	StoneMintAddress string
	CardStateAddress string

	// === profile ===
	Name          string
	Species       string
	Lore          string
	MovementClass string
	Behaviour     string
	Personality   string
	Abilities     string
	Habitat       string
	Biome         Biome
	Rarity        Rarity
	Stone         StoneType
	SerialNumber  int
	Generation    int

	Status string

	// === metadata ===
	MetadataUri string
	ImageCid    string

	Minted  time.Time
	Created time.Time
}

type Product struct {
	Id    string
	Price int64
}

type Order struct {
	Id             uuid.UUID
	UserId         string
	Product        string
	Price          int
	StripeIntentId string
	Status         string
	Created        time.Time
	Paid           *time.Time
	Fulfilled      *time.Time
}

type Purchase struct {
	Id      int
	UserId  string
	OrderId uuid.UUID
	Product string
	Status  string
	Payload map[string]any
	Created time.Time
	Opened  *time.Time
}

func (stats *RarityStats) PickRarity(stone StoneType) Rarity {
	baseProbs, exists := stoneProbabilities[stone]
	if !exists {
		stone = StoneQuartz
		baseProbs = stoneProbabilities[stone]
	}

	rarities := []Rarity{RarityCommon, RarityRare, RarityEpic, RarityMythic, RarityLegendary}

	remaining := map[Rarity]int{
		RarityCommon:    seasonLimits[RarityCommon] - stats.CommonIssued,
		RarityRare:      seasonLimits[RarityRare] - stats.RareIssued,
		RarityEpic:      seasonLimits[RarityEpic] - stats.EpicIssued,
		RarityMythic:    seasonLimits[RarityMythic] - stats.MythicIssued,
		RarityLegendary: seasonLimits[RarityLegendary] - stats.LegendaryIssued,
	}

	totalRemaining := 0
	for _, r := range remaining {
		totalRemaining += r
	}
	if totalRemaining == 0 {
		return RarityCommon
	}

	adjustedProbs := make([]float64, len(rarities))
	totalPool := 840000

	for i, rarity := range rarities {
		if remaining[rarity] <= 0 {
			adjustedProbs[i] = 0
			continue
		}

		baseProb := float64(baseProbs[i])
		expectedRatio := float64(seasonLimits[rarity]) / float64(totalPool)
		currentRatio := float64(remaining[rarity]) / float64(totalRemaining)

		var adjustment float64

		if currentRatio < expectedRatio*0.8 {
			adjustment = 1.5
		} else if currentRatio < expectedRatio*0.9 {
			adjustment = 1.2
		} else if currentRatio > expectedRatio*1.2 {
			adjustment = 0.7
		} else if currentRatio > expectedRatio*1.1 {
			adjustment = 0.9
		} else {
			adjustment = 1.0
		}

		adjustedProbs[i] = baseProb * adjustment
	}

	totalProb := 0.0
	for _, prob := range adjustedProbs {
		totalProb += prob
	}

	if totalProb == 0 {
		return getAnyAvailableRarity(remaining)
	}

	randVal := rand.Float64() * totalProb
	cumulative := 0.0

	for i, prob := range adjustedProbs {
		cumulative += prob
		if randVal <= cumulative {
			return rarities[i]
		}
	}

	return getAnyAvailableRarity(remaining)
}

func GeneratePackPayload(totalSparks int) map[string]int {

	weights := []struct {
		Type   StoneType
		Weight int
	}{
		{StoneQuartz, 100},
		{StoneAmazonite, 60},
		{StoneAgate, 30},
		{StoneRuby, 15},
		{StoneSapphire, 8},
		{StoneTopaz, 4},
		{StoneJade, 1},
	}

	result := make(map[string]int)
	totalWeight := 0
	for _, w := range weights {
		totalWeight += w.Weight
	}

	for i := 0; i < totalSparks; i++ {
		rnd := rand.Intn(totalWeight)
		currentSum := 0

		for _, w := range weights {
			currentSum += w.Weight
			if rnd < currentSum {
				result[string(w.Type)]++
				break
			}
		}
	}

	return result
}

func getAnyAvailableRarity(remaining map[Rarity]int) Rarity {

	var available []Rarity
	for rarity, rem := range remaining {
		if rem > 0 {
			available = append(available, rarity)
		}
	}

	if len(available) == 0 {
		return RarityCommon
	}

	return available[rand.Intn(len(available))]
}
