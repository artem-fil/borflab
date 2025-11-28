package main

import (
	"context"
	"database/sql"
	"time"

	_ "github.com/lib/pq"
)

type DB struct {
	Conn *sql.DB
}

func NewDB(ctx context.Context, cfg DBConfig) (*DB, error) {
	conn, err := sql.Open("postgres", cfg.ConnURL)
	if err != nil {
		return nil, err
	}
	conn.SetMaxOpenConns(50)
	conn.SetMaxIdleConns(10)
	conn.SetConnMaxLifetime(1 * time.Hour)
	if err := conn.PingContext(ctx); err != nil {
		conn.Close()
		return nil, err
	}

	LogInfo("DB", "Connected to Postgres.")

	return &DB{Conn: conn}, nil
}

func (db *DB) Close() error {
	return db.Conn.Close()
}

func (db *DB) UpsertUser(ctx context.Context, u *User) (*User, error) {
	row := db.Conn.QueryRowContext(
		ctx,
		`
insert into users (privy_id, email, wallet, created, synced)
values ($1, $2, $3, now(), now())
on conflict (privy_id)
do update set
	email = excluded.email,
	wallet = excluded.wallet,
	synced = now()
returning privy_id, email, wallet, created, synced
	`,
		u.PrivyId,
		nullable(u.Email),
		nullable(u.Wallet),
	)

	var updated User
	if err := row.Scan(&updated.PrivyId, &updated.Email, &updated.Wallet, &updated.Created, &updated.Synced); err != nil {
		return nil, err
	}

	return &updated, nil
}

func (db *DB) SelectExperiment(ctx context.Context, id string) (*Experiment, error) {
	row := db.Conn.QueryRowContext(
		ctx,
		`
select from experiments (
    user_id,
    input_mime,
    input_size,
    input_width,
    input_height,
    processed_mime,
    processed_size,
    processed_width,
    processed_height,
	stone,
	biome,
	specimen,
	rarity,
	created
) where id = $1;`,
		id,
	)

	experiment := &Experiment{}

	if err := row.Scan(
		&experiment.Id,
		&experiment.UserId,
		&experiment.InputMime,
		&experiment.InputSize,
		&experiment.InputWidth,
		&experiment.InputHeight,
		&experiment.ProcessedMime,
		&experiment.ProcessedSize,
		&experiment.ProcessedWidth,
		&experiment.ProcessedHeight,
		&experiment.Stone,
		&experiment.Biome,
		&experiment.Specimen,
		&experiment.Rarity,
		&experiment.Created,
	); err != nil {
		return nil, err
	}

	return experiment, nil
}

func (db *DB) InsertExperiment(ctx context.Context, e *Experiment) (*Experiment, error) {
	row := db.Conn.QueryRowContext(
		ctx,
		`
insert into experiments (
    user_id,
    input_mime,
    input_size,
    input_width,
    input_height,
    processed_mime,
    processed_size,
    processed_width,
    processed_height,
    processed_image,
	stone,
	biome
) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
returning 
    id,
    user_id,
    input_mime,
    input_size,
    input_width,
    input_height,
    processed_mime,
    processed_size,
    processed_width,
    processed_height,
	stone,
	biome,
    created
        `,
		e.UserId,
		e.InputMime,
		e.InputSize,
		e.InputWidth,
		e.InputHeight,
		e.ProcessedMime,
		e.ProcessedSize,
		e.ProcessedWidth,
		e.ProcessedHeight,
		e.ProcessedImage,
		e.Stone,
		e.Biome,
	)

	var inserted Experiment
	if err := row.Scan(
		&inserted.Id,
		&inserted.UserId,
		&inserted.InputMime,
		&inserted.InputSize,
		&inserted.InputWidth,
		&inserted.InputHeight,
		&inserted.ProcessedMime,
		&inserted.ProcessedSize,
		&inserted.ProcessedWidth,
		&inserted.ProcessedHeight,
		&inserted.Stone,
		&inserted.Biome,
		&inserted.Created,
	); err != nil {
		return nil, err
	}

	return &inserted, nil
}

func (db *DB) AnalyzeExperiment(ctx context.Context, e *Experiment) (sql.Result, error) {
	result, err := db.Conn.ExecContext(
		ctx,
		`
update experiments set
    specimen = $1,
    analyzed = $2
where id = $3
        `,
		e.Specimen,
		e.Analyzed,
		e.Id,
	)

	return result, err
}

func (db *DB) FinishExperiment(ctx context.Context, e *Experiment) (sql.Result, error) {
	result, err := db.Conn.ExecContext(
		ctx,
		`
update experiments set
		image_cid = $1,
		metadata_cid = $2,
		generated = $3,
		uploaded = $4
where id = $5
        `,
		e.ImageCID,
		e.MetadataCID,
		e.Generated,
		e.Uploaded,
		e.Id,
	)

	return result, err
}

func (db *DB) SelectRarities(ctx context.Context) (RarityStats, error) {
	var stats RarityStats

	err := db.Conn.QueryRowContext(
		ctx,
		`
select 
            count(*) filter (where rarity = 'common'),
            count(*) filter (where rarity = 'rare'),
            count(*) filter (where rarity = 'epic'),
            count(*) filter (where rarity = 'mythic'),
            count(*) filter (where rarity = 'legendary')
        FROM monsters`,
	).Scan(&stats.CommonIssued, &stats.RareIssued, &stats.EpicIssued, &stats.MythicIssued, &stats.LegendaryIssued)

	return stats, err
}

func nullable(s string) sql.NullString {
	if s == "" {
		LogWarning("DB", "empty string converted to SQL nullstring")
		return sql.NullString{Valid: false}
	}
	return sql.NullString{String: s, Valid: true}
}
