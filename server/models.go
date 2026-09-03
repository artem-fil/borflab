package main

import (
	"encoding/json"
	"math/rand"
	"time"

	"github.com/google/uuid"
)

var seasonLimits = map[Rarity]int{
	RarityCommon:    420000,
	RarityRare:      420000,
	RarityEpic:      352800,
	RarityMythic:    285600,
	RarityLegendary: 201600,
}

var stoneProbabilities = map[StoneType][5]int{
	StoneQuartz:    {32, 27, 21, 13, 7},
	StoneAmazonite: {29, 27, 22, 14, 8},
	StoneAgate:     {27, 26, 22, 15, 10},
	StoneRuby:      {24, 25, 22, 17, 12},
	StoneSapphire:  {21, 24, 22, 18, 15},
	StoneTopaz:     {18, 23, 21, 20, 18},
	StoneJade:      {15, 22, 20, 22, 21},
}

type Biome string

const (
	BiomeAmazonia  Biome = "amazonia"
	BiomeCoralux   Biome = "coralux"
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
	BorfId  string
	Email   string
	Wallets []string
	Created time.Time
	Synced  time.Time
}

type Experiment struct {
	Id     int
	UUID   string
	UserId string

	InputMime   string
	InputSize   int
	InputWidth  int
	InputHeight int
	InputUrl    string

	ImageUrl string
	ThumbUrl string

	Specimen    json.RawMessage
	ImageCID    string
	MetadataCID string
	Metadata    json.RawMessage
	Stone       StoneType
	Biome       Biome
	Rarity      Rarity

	// dashboard
	IsTest               bool
	PromptAnalyzeUsed    string
	PromptGenerationUsed string
	Quality              string
	Size                 string
	TokensUsed           *TokensUsed
	Cost                 float64

	Created   time.Time
	Analyzed  *time.Time
	Generated *time.Time
	Uploaded  *time.Time
	Minted    *time.Time
}

type TokensUsed struct {
	AnalyzeTextIn  int
	AnalyzeImgIn   int
	AnalyzeOut     int
	GenerateTextIn int
	GenerateImgOut int
}

func (t *TokensUsed) TotalCost() float64 {

	const (
		gpt4oTextIn = 0.005
		gpt4oImgIn  = 0.005
		gpt4oOut    = 0.015
		imgTextIn   = 0.005
		imgOut      = 0.015
	)
	total := float64(t.AnalyzeTextIn)/1000*gpt4oTextIn +
		float64(t.AnalyzeImgIn)/1000*gpt4oImgIn +
		float64(t.AnalyzeOut)/1000*gpt4oOut +
		float64(t.GenerateTextIn)/1000*imgTextIn +
		float64(t.GenerateImgOut)/1000*imgOut
	return total
}

type PromptPayload struct {
	PromptAnalyze    map[Biome]string
	PromptStone      map[StoneType]map[Biome]string
	PromptGeneration map[Biome]string
}

type ExperimentFilter struct {
	OnlyTest  bool
	Stones    []string
	Biomes    []string
	Qualities []string
	Rarities  []string
	Sort      string
	Order     string
	Limit     int
	Offset    int
}

type Prompt struct {
	Slot    int
	Name    string
	Payload PromptPayload
	Updated time.Time
}

type Stone struct {
	Id           int
	UserId       string
	MintAddress  *string
	OwnerAddress *string
	SparkCount   int
	Type         StoneType
	PdaAddress   *string
	Signature    *string
	Slot         *int64
	Minted       *time.Time
	Created      time.Time
}

type StoneStats struct {
	MintAddress *string
	Type        StoneType
	SparkCount  int
}

type MonsterStats struct {
	ByBiome  map[string]int
	ByStone  map[string]int
	ByRarity map[string]int
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
	Height        int
	Weight        int
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
	SerialStone   int
	SerialBiome   int
	Generation    int

	Status string

	// === metadata ===
	MetadataUri string
	ImageCid    string

	// === images ===
	InputUrl *string
	ImageUrl *string
	ThumbUrl *string
	// Sprites stores a map of sprite pose names to their CID/URL, populated asynchronously
	Sprites map[string]string `json:"sprites,omitempty"`

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
	Id       int
	UserId   string
	OrderId  *uuid.UUID
	Product  string
	Status   string
	Provider string
	Payload  json.RawMessage
	Created  time.Time
	Opened   *time.Time
}

type SizeRange struct {
	MinHeightCm int
	MaxHeightCm int
	MinWeightG  int
	MaxWeightG  int
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
		{StoneQuartz, 22},
		{StoneAmazonite, 18},
		{StoneRuby, 16},
		{StoneAgate, 14},
		{StoneSapphire, 12},
		{StoneTopaz, 10},
		{StoneJade, 8},
	}

	result := make(map[string]int)
	totalWeight := 0
	for _, w := range weights {
		totalWeight += w.Weight
	}

	for range totalSparks {
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
