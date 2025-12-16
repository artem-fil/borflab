package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/lib/pq"
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

func (db *DB) SelectUserByWallet(ctx context.Context, wallet string) (*User, error) {
	row := db.Conn.QueryRowContext(
		ctx,
		`
select privy_id, email, wallet, created, synced from users
where wallet = $1
	`,
		wallet,
	)

	var user User
	err := row.Scan(
		&user.PrivyId,
		&user.Email,
		&user.Wallet,
		&user.Created,
		&user.Synced,
	)
	if err != nil {
		return nil, err
	}

	return &user, nil
}

func (db *DB) SelectStone(ctx context.Context, mintAddress string, userId string) (*Stone, error) {
	var stone Stone
	err := db.Conn.QueryRowContext(
		ctx,
		`
select id, user_id, mint_address, owner_address, spark_count, type, pda_address, signature, slot, minted, created
from stones where mint_address = $1 and user_id = $2
	`,
		mintAddress,
		userId,
	).Scan(
		&stone.Id,
		&stone.UserId,
		&stone.MintAddress,
		&stone.OwnerAddress,
		&stone.SparkCount,
		&stone.Type,
		&stone.PdaAddress,
		&stone.Signature,
		&stone.Slot,
		&stone.Minted,
		&stone.Created,
	)
	if err != nil {
		return nil, err
	}

	return &stone, nil
}

func (db *DB) SelectStoneStats(ctx context.Context, userId string) ([]StoneStats, error) {
	rows, err := db.Conn.QueryContext(
		ctx,
		`
select
    t.type,
    coalesce(sum(s.spark_count) filter (where s.spark_count > 0), 0) as spark_count,
    min_stone.mint_address
from unnest(enum_range(null::stone)) as t(type)
left join stones s
    on s.user_id = $1
   and s.type = t.type
left join lateral (
    select mint_address
    from stones
    where user_id = $1
      and type = t.type
      and spark_count > 0
    order by spark_count
    limit 1
) min_stone on true
group by
    t.type,
    min_stone.mint_address;`,
		userId,
	)

	if err != nil {
		return nil, err

	}
	defer rows.Close()
	var stoneStats []StoneStats

	for rows.Next() {
		var stoneStat StoneStats
		err := rows.Scan(
			&stoneStat.Type,
			&stoneStat.SparkCount,
			&stoneStat.MintAddress,
		)
		if err != nil {
			return nil, err
		}
		stoneStats = append(stoneStats, stoneStat)
	}

	return stoneStats, nil
}

func (db *DB) SelectMonsters(ctx context.Context, userId string, limit int, offset int, sort string, order string) ([]Monster, int, error) {
	var monsters []Monster
	var total int

	countQuery := `select count(*) from monsters where user_id = $1`
	err := db.Conn.QueryRowContext(ctx, countQuery, userId).Scan(&total)
	if err != nil {
		return monsters, 0, err
	}

	if total == 0 {
		return monsters, 0, nil
	}

	sortOrder := fmt.Sprintf("%s %s", sort, order)

	rows, err := db.Conn.QueryContext(
		ctx,
		fmt.Sprintf(`
select
	id,
	user_id,
	experiment_id,
	mint_address,
	owner_address,
	stone_mint_address,
	card_state_address,
	name,
	species,
	lore,
	movement_class,
	behaviour,
	personality,
	abilities,
	habitat,
	biome,
	rarity,
	metadata_uri,
	image_cid,
	serial_number,
	generation,
	signature,
	slot,
	minted,
	created
from monsters where user_id = $1 order by %s limit $2 offset $3;`, sortOrder),
		userId, limit, offset,
	)
	if err != nil {
		return monsters, 0, err

	}
	defer rows.Close()

	for rows.Next() {
		var monster Monster
		err := rows.Scan(
			&monster.Id,
			&monster.UserId,
			&monster.ExperimentId,
			&monster.MintAddress,
			&monster.OwnerAddress,
			&monster.StoneMintAddress,
			&monster.CardStateAddress,
			&monster.Name,
			&monster.Species,
			&monster.Lore,
			&monster.MovementClass,
			&monster.Behaviour,
			&monster.Personality,
			&monster.Abilities,
			&monster.Habitat,
			&monster.Biome,
			&monster.Rarity,
			&monster.MetadataUri,
			&monster.ImageCid,
			&monster.SerialNumber,
			&monster.Generation,
			&monster.Signature,
			&monster.Slot,
			&monster.Minted,
			&monster.Created,
		)
		if err != nil {
			return monsters, 0, err
		}
		monsters = append(monsters, monster)
	}
	return monsters, total, err
}

func (db *DB) SelectExperiment(ctx context.Context, id string) (*Experiment, error) {
	row := db.Conn.QueryRowContext(
		ctx,
		`
        select 
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
			specimen,
			image_cid,
			metadata_cid,
			metadata,
            stone,
            biome,
            rarity,
            created
        from experiments
        where id = $1;
        `,
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
		&experiment.Specimen,
		&experiment.ImageCID,
		&experiment.MetadataCID,
		&experiment.Metadata,
		&experiment.Stone,
		&experiment.Biome,
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
		rarity = $1,
		image_cid = $2,
		metadata_cid = $3,
		metadata = $4,
		generated = $5,
		uploaded = $6
where id = $7
        `,
		e.Rarity,
		e.ImageCID,
		e.MetadataCID,
		e.Metadata,
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

func (db *DB) InsertSolanaNotification(ctx context.Context, n *SolanaNotification) error {

	eventsJson, err := json.Marshal(n.Events)
	if err != nil {
		return err
	}

	_, err = db.Conn.ExecContext(
		ctx,
		`
insert into solana_notifications (signature, slot, stage, logs, events)
values ($1, $2, $3, $4, $5)
returning id
        `,
		n.Params.Result.Value.Signature,
		n.Params.Result.Context.Slot,
		n.Stage,
		pq.Array(n.Params.Result.Value.Logs),
		eventsJson,
	)

	return err
}

func (db *DB) InsertStoneTx(ctx context.Context, tx *sql.Tx, stone *Stone) error {
	fmt.Printf("\n%+v\n", stone)
	result, err := tx.ExecContext(
		ctx,
		`
		insert into stones (
			user_id, mint_address, owner_address, spark_count, type, pda_address, signature, slot, minted
		) values ((select privy_id from users where wallet = $1), $2, $3, $4, $5, $6, $7, $8, $9)
		on conflict (signature) do nothing
		`,
		stone.OwnerAddress,
		stone.MintAddress,
		stone.OwnerAddress,
		stone.SparkCount,
		stone.Type,
		stone.PdaAddress,
		stone.Signature,
		stone.Slot,
		stone.Minted,
	)
	if err != nil {
		return err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}

	if rowsAffected == 0 {
		return fmt.Errorf("no rows updated for address: %s", stone.MintAddress)
	}
	return err
}

func (db *DB) UpdateStoneTx(ctx context.Context, tx *sql.Tx, stoneAddress string, sparkCount int) error {

	result, err := tx.ExecContext(
		ctx,
		`
		update stones set spark_count = $1 where mint_address = $2
		`,
		sparkCount,
		stoneAddress,
	)
	if err != nil {
		return err
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}

	if rowsAffected == 0 {
		return fmt.Errorf("no rows updated for address: %s", stoneAddress)
	}
	return err
}

func (db *DB) InsertMonsterTx(ctx context.Context, tx *sql.Tx, monster *Monster) error {
	_, err := tx.ExecContext(
		ctx,
		`
insert into monsters (
	user_id,
	experiment_id,
	mint_address,
	owner_address,
	stone_mint_address,
	card_state_address,
	name,
	species,
	lore,
	movement_class,
	behaviour,
	personality,
	abilities,
	habitat,
	biome,
	rarity,
	metadata_uri,
	image_cid,
	serial_number,
	generation,
	signature,
	slot,
	minted
) values ((select privy_id from users where wallet = $1), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
on conflict (signature) do nothing
		`,
		monster.OwnerAddress,
		monster.ExperimentId,
		monster.MintAddress,
		monster.OwnerAddress,
		monster.StoneMintAddress,
		monster.CardStateAddress,
		monster.Name,
		monster.Species,
		monster.Lore,
		monster.MovementClass,
		monster.Behaviour,
		monster.Personality,
		monster.Abilities,
		monster.Habitat,
		monster.Biome,
		monster.Rarity,
		monster.MetadataUri,
		monster.ImageCid,
		monster.SerialNumber,
		monster.Generation,
		monster.Signature,
		monster.Slot,
		monster.Minted,
	)
	return err
}

func (db *DB) SelectTxStatus(ctx context.Context, signature string) (bool, error) {
	exists := false
	err := db.Conn.QueryRowContext(
		ctx,
		`
		select exists(select stage = 'done' from solana_notifications where signature = $1);
		`,
		signature,
	).Scan(&exists)
	if err != nil {
		return exists, err
	}
	return exists, err
}

func nullable(s string) sql.NullString {
	if s == "" {
		LogWarning("DB", "empty string converted to SQL nullstring")
		return sql.NullString{Valid: false}
	}
	return sql.NullString{String: s, Valid: true}
}
