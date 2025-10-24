package main

import (
	"encoding/json"
	"time"
)

type User struct {
	PrivyId string
	Email   string
	Wallet  string
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

	Specimen json.RawMessage

	OutputImageCid    string
	OutputMetadataCid string
	OutputMetadata    json.RawMessage

	Created   time.Time
	Analyzed  *time.Time
	Generated *time.Time
	Uploaded  *time.Time
	Minted    *time.Time
}

type MetaplexMetadata struct {
	Name                 string              `json:"name"`                              // required
	Symbol               string              `json:"symbol"`                            // required: NFT ticker
	Description          string              `json:"description,omitempty"`             // optional
	SellerFeeBasisPoints uint16              `json:"seller_fee_basis_points,omitempty"` // optional: royalty in basis points
	Image                string              `json:"image"`                             // required: ipfs://CID
	ExternalURL          string              `json:"external_url,omitempty"`            // optional
	Attributes           []MetaplexAttribute `json:"attributes,omitempty"`              // optional: for rarity/traits
	Collection           *MetaplexCollection `json:"collection,omitempty"`              // optional
	Properties           MetaplexProperties  `json:"properties"`                        // required for Metaplex
}

type MetaplexAttribute struct {
	TraitType   string `json:"trait_type"`             // required: attribute name
	Value       any    `json:"value"`                  // required: attribute value
	DisplayType string `json:"display_type,omitempty"` // optional: e.g., "number", "date"
	MaxValue    int    `json:"max_value,omitempty"`    // optional
	TraitCount  int    `json:"trait_count,omitempty"`  // optional
}

type MetaplexCollection struct {
	Name   string `json:"name"`   // required: collection name
	Family string `json:"family"` // optional: for grouping NFTs
}

type MetaplexProperties struct {
	Creators []MetaplexCreator `json:"creators"` // required: array of creators
	Files    []MetaplexFile    `json:"files"`    // required: NFT files
}

type MetaplexCreator struct {
	Address  string `json:"address"`            // required: creator's wallet address
	Share    uint8  `json:"share"`              // required: percentage share, sum of all creators should be 100
	Verified bool   `json:"verified,omitempty"` // optional: true if creator is verified
}

type MetaplexFile struct {
	URI  string `json:"uri"`  // required: file link (ipfs://CID)
	Type string `json:"type"` // required: MIME type of the file, e.g., "image/png"
}
