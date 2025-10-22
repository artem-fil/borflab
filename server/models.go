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

	OutputImage string

	Created  time.Time
	Analyzed *time.Time
	Finished *time.Time
}
