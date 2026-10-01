package main

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/lib/pq"
)

type DB struct {
	Conn *sql.DB
}

const MaxSpriteRetries = 5

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

func (db *DB) UpsertUser(ctx context.Context, u *User) (*User, bool, error) {

	row := db.Conn.QueryRowContext(
		ctx,
		`
WITH new_user_data AS (
    SELECT 
        $1::text as p_id,
        $2::text as p_email,
        upper(substring(split_part($2::text, '@', 1) from 1 for 3)) as p_prefix
),
next_val AS (
    SELECT count(*) + 1 as val FROM users
)
insert into users (privy_id, email, wallets, borf_id, created, synced)
select 
    d.p_id, 
    d.p_email, 
    $3, 
    d.p_prefix || '-' || to_char(n.val, 'FM00000') || '-' || to_char(now(), 'YY') || '/I',
    now(), 
    now()
from new_user_data d, next_val n
on conflict (privy_id)
do update set
    email = excluded.email,
    wallets = excluded.wallets,
    synced = now()
returning
    privy_id,
    email,
    wallets,
    borf_id,
    created,
    synced,
    (xmax = 0) as is_new
    `,
		u.PrivyId,
		nullable(u.Email),
		pq.Array(u.Wallets),
	)

	var updated User
	var isNew bool
	var wallets pq.StringArray

	if err := row.Scan(
		&updated.PrivyId,
		&updated.Email,
		&wallets,
		&updated.BorfId,
		&updated.Created,
		&updated.Synced,
		&isNew,
	); err != nil {
		return nil, false, err
	}

	updated.Wallets = []string(wallets)
	return &updated, isNew, nil
}

func (db *DB) GetLastSignature(ctx context.Context) (string, error) {
	var signature string
	err := db.Conn.QueryRowContext(
		ctx,
		`
select last_signature from solana_meta limit 1;
	`,
	).Scan(&signature)

	if err != nil {
		return signature, err
	}

	return signature, nil
}

func (db *DB) SetLastSignature(ctx context.Context, lastSignature string) error {
	_, err := db.Conn.ExecContext(ctx, `
update solana_meta set last_signature = $1, updated = now();
    `, lastSignature)

	if err != nil {
		return fmt.Errorf("failed to update sync cursor: %w", err)
	}
	return nil
}

func (db *DB) SelectUserByWallet(ctx context.Context, wallet string) (*User, error) {
	row := db.Conn.QueryRowContext(
		ctx,
		`
select privy_id, email, wallets, created, synced from users
where wallet = $1
	`,
		wallet,
	)

	var user User
	err := row.Scan(
		&user.PrivyId,
		&user.Email,
		&user.Wallets,
		&user.Created,
		&user.Synced,
	)
	if err != nil {
		return nil, err
	}

	return &user, nil
}

func (db *DB) SelectStone(ctx context.Context, stoneType string, userId string) (*Stone, error) {
	var stone Stone
	err := db.Conn.QueryRowContext(
		ctx,
		`
        select 
            id, user_id, mint_address, owner_address, spark_count, 
            type, pda_address, signature, slot, minted, created
        from stones 
        where user_id = $1 
          and type = $2 
          and spark_count > 0
        limit 1
        `,
		userId,
		stoneType,
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

func (db *DB) SelectSuitableStone(ctx context.Context, stoneType string, userId string) (*Stone, error) {
	var stone Stone
	err := db.Conn.QueryRowContext(
		ctx,
		`
        select 
    id, 
    user_id,
    mint_address, 
    owner_address, 
    spark_count, 
    type, 
    pda_address, 
    signature, 
    slot, 
    minted, 
    created
from stones
where user_id = $1 
  and type = $2 
  and spark_count > 0
order by spark_count asc limit 1;
        `,
		userId,
		stoneType,
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

func (db *DB) SelectMonsterStats(ctx context.Context) (*MonsterStats, error) {

	var (
		byBiomeRaw  []byte
		byStoneRaw  []byte
		byRarityRaw []byte
	)

	err := db.Conn.QueryRowContext(ctx, `
with
biome_stats as (
    select
        b.biome::text as key,
        coalesce(count(m.id), 0)::int as value
    from unnest(enum_range(null::biome)) as b(biome)
    left join monsters m
        on m.biome = b.biome
    group by b.biome
),
stone_stats as (
    select
        s.stone::text as key,
        coalesce(count(m.id), 0)::int as value
    from unnest(enum_range(null::stone)) as s(stone)
    left join monsters m
        on m.stone = s.stone
    group by s.stone
),
rarity_stats as (
    select
        r.rarity::text as key,
        coalesce(count(m.id), 0)::int as value
    from unnest(enum_range(null::rarity)) as r(rarity)
    left join monsters m
        on m.rarity = r.rarity
    group by r.rarity
)
select
    (select jsonb_object_agg(key, value) from biome_stats)  as by_biome,
    (select jsonb_object_agg(key, value) from stone_stats)  as by_stone,
    (select jsonb_object_agg(key, value) from rarity_stats) as by_rarity;
    `).Scan(
		&byBiomeRaw,
		&byStoneRaw,
		&byRarityRaw,
	)

	if err != nil {
		return nil, err
	}

	stats := MonsterStats{
		ByBiome:  make(map[string]int),
		ByStone:  make(map[string]int),
		ByRarity: make(map[string]int),
	}

	if err := json.Unmarshal(byBiomeRaw, &stats.ByBiome); err != nil {
		return nil, err
	}
	if err := json.Unmarshal(byStoneRaw, &stats.ByStone); err != nil {
		return nil, err
	}
	if err := json.Unmarshal(byRarityRaw, &stats.ByRarity); err != nil {
		return nil, err
	}

	return &stats, nil
}

func (db *DB) SelectStoneStats(ctx context.Context, userId string) (map[string]int, error) {
	rows, err := db.Conn.QueryContext(
		ctx,
		`
        select
            t.type,
            coalesce(sum(s.spark_count), 0)::int
        from unnest(enum_range(null::stone)) as t(type)
        left join stones s
            on s.user_id = $1
           and s.type = t.type
        group by t.type;`,
		userId,
	)

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	stats := make(map[string]int)

	for rows.Next() {
		var stoneType string
		var sparkCount int
		if err := rows.Scan(&stoneType, &sparkCount); err != nil {
			return nil, err
		}
		stats[stoneType] = sparkCount
	}

	return stats, nil
}

func (db *DB) SelectMonsters(ctx context.Context, userId string, limit int, offset int, sort string, order string) ([]Monster, int, error) {
	monsters := make([]Monster, 0)
	var total int

	countQuery := `select count(*) from monsters where user_id = $1 and owner_address is not null and status = 'active';`
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
	id, user_id, experiment_id,
	mint_address, owner_address, stone_mint_address, card_state_address,
	name, height, weight, species, lore,
	movement_class, behaviour, personality, abilities, habitat,
	biome, rarity, stone,
	metadata_uri, image_cid,
	input_url, image_url, thumb_url,
	serial_number, serial_stone, serial_biome, generation, status,
	signature, slot, minted, created
from monsters where user_id = $1 order by %s limit $2 offset $3;`, sortOrder),
		userId, limit, offset,
	)
	if err != nil {
		return monsters, 0, err
	}
	defer rows.Close()

	for rows.Next() {
		var m Monster
		err = rows.Scan(
			&m.Id, &m.UserId, &m.ExperimentId,
			&m.MintAddress, &m.OwnerAddress, &m.StoneMintAddress, &m.CardStateAddress,
			&m.Name, &m.Height, &m.Weight, &m.Species, &m.Lore,
			&m.MovementClass, &m.Behaviour, &m.Personality, &m.Abilities, &m.Habitat,
			&m.Biome, &m.Rarity, &m.Stone,
			&m.MetadataUri, &m.ImageCid,
			&m.InputUrl, &m.ImageUrl, &m.ThumbUrl,
			&m.SerialNumber, &m.SerialStone, &m.SerialBiome, &m.Generation, &m.Status,
			&m.Signature, &m.Slot, &m.Minted, &m.Created,
		)
		if err != nil {
			return monsters, 0, err
		}
		monsters = append(monsters, m)
	}
	return monsters, total, rows.Err()
}

func (db *DB) SelectMonster(ctx context.Context, mintAddress string, userId string) (Monster, error) {
	var m Monster
	err := db.Conn.QueryRowContext(ctx, `
select
	id, user_id, experiment_id,
	mint_address, owner_address, stone_mint_address, card_state_address,
	name, height, weight, species, lore,
	movement_class, behaviour, personality, abilities, habitat,
	biome, rarity, stone,
	metadata_uri, image_cid,
	input_url, image_url, thumb_url,
	sprite_hit_url, sprite_walk_url, sprite_idle_url, sprite_avatar_url, sprite_status,
	serial_number, serial_stone, serial_biome, generation, status,
	signature, slot, minted, created
from monsters where id = $1 and user_id = $2;`, mintAddress, userId).Scan(
		&m.Id, &m.UserId, &m.ExperimentId,
		&m.MintAddress, &m.OwnerAddress, &m.StoneMintAddress, &m.CardStateAddress,
		&m.Name, &m.Height, &m.Weight, &m.Species, &m.Lore,
		&m.MovementClass, &m.Behaviour, &m.Personality, &m.Abilities, &m.Habitat,
		&m.Biome, &m.Rarity, &m.Stone,
		&m.MetadataUri, &m.ImageCid,
		&m.InputUrl, &m.ImageUrl, &m.ThumbUrl,
		&m.SpriteHitUrl, &m.SpriteWalkUrl, &m.SpriteIdleUrl, &m.SpriteAvatarUrl, &m.SpriteStatus,
		&m.SerialNumber, &m.SerialStone, &m.SerialBiome, &m.Generation, &m.Status,
		&m.Signature, &m.Slot, &m.Minted, &m.Created,
	)
	return m, err
}

func (db *DB) SelectMonsterById(ctx context.Context, id int) (*Monster, error) {
	query := `
		SELECT id, experiment_id, owner_address, name, metadata_uri, mint_status, mint_retries 
		FROM monsters 
		WHERE id = $1
	`
	m := &Monster{}
	err := db.Conn.QueryRowContext(ctx, query, id).Scan(
		&m.Id, &m.ExperimentId, &m.OwnerAddress, &m.Name, &m.MetadataUri, &m.MintStatus, &m.MintRetries,
	)
	return m, err
}

func (db *DB) IncrementMintRetry(ctx context.Context, id int, finalStatus string) error {
	query := `
		UPDATE monsters 
		SET mint_retries = mint_retries + 1,
		    mint_status = CASE WHEN mint_retries + 1 >= 3 THEN $1 ELSE 'pending' END
		WHERE id = $2
	`
	_, err := db.Conn.ExecContext(ctx, query, finalStatus, id)
	return err
}

func (db *DB) UpdateMonsterCids(ctx context.Context, monsterId int, imageCid, metadataUri string) error {
	query := `
		UPDATE monsters 
		SET image_cid = $1, metadata_uri = $2 
		WHERE id = $3
	`
	_, err := db.Conn.ExecContext(ctx, query, imageCid, metadataUri, monsterId)
	if err != nil {
		return fmt.Errorf("failed to update monster cids: %w", err)
	}

	return nil
}

func (db *DB) UpdateMonsterSpriteStatus(ctx context.Context, id int, status string) error {
	query := `UPDATE monsters SET sprite_status = $1, sprite_updated = now() WHERE id = $2`
	_, err := db.Conn.ExecContext(ctx, query, status, id)
	return err
}

func (db *DB) UpdateMonsterSpritesSuccess(ctx context.Context, id int, idleUrl, walkUrl, hitUrl, avatarUrl string) error {
	query := `
		UPDATE monsters SET 
			sprite_idle_url = $1,
			sprite_walk_url = $2,
			sprite_hit_url = $3,
			sprite_avatar_url = $4,
			sprite_status = 'ready'
		WHERE id = $5
	`
	_, err := db.Conn.ExecContext(ctx, query, idleUrl, walkUrl, hitUrl, avatarUrl, id)
	return err
}

func (db *DB) SelectMonsterByExperimentIdTx(ctx context.Context, tx *sql.Tx, experimentId int) (*Monster, error) {
	row := tx.QueryRowContext(ctx, `
		SELECT id, experiment_id, metadata_uri
		FROM monsters
		WHERE experiment_id = $1
	`, experimentId)

	var m Monster
	var metadataUri sql.NullString
	if err := row.Scan(&m.Id, &m.ExperimentId, &metadataUri); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	if metadataUri.Valid {
		m.MetadataUri = &metadataUri.String
	}
	return &m, nil
}

// IncrementSpriteRetry bumps the retry counter, records the new status
// (usually "failed" for a give-up-this-attempt, or "processing" if we're
// about to try again inline) and stamps sprite_updated.
func (d *DB) IncrementSpriteRetry(ctx context.Context, monsterId int, status string) error {
	_, err := d.Conn.ExecContext(ctx, `
		UPDATE monsters
		SET sprite_status   = $2,
		    sprite_retries  = sprite_retries + 1,
		    sprite_updated = now()
		WHERE id = $1
	`, monsterId, status)
	return err
}

// SpriteWatchdogCandidate is the minimal shape the watchdog needs.
type SpriteWatchdogCandidate struct {
	MonsterId     int
	SpriteStatus  string
	SpriteRetries int
}

// SelectStalledSpriteMonsters returns monsters whose sprite generation is
// either stuck in "processing" past a hard timeout, or sitting in "failed"
// past its backoff window, and hasn't exhausted MaxSpriteRetries yet.
//
// processingTimeout: how long "processing" can sit before we assume the
// worker died mid-flight (e.g. 10 * time.Minute — matches the task TTL
// used elsewhere in this codebase).
// backoffFn: given the current retry count, returns how long to wait
// before the next retry of a "failed" row.
func (d *DB) SelectStalledSpriteMonsters(
	ctx context.Context,
	processingTimeout time.Duration,
	backoffFn func(retries int) time.Duration,
) ([]SpriteWatchdogCandidate, error) {

	// Pull failed/processing rows under the retry cap; we do the per-row
	// backoff check in Go since it's not a fixed interval (SQL could also
	// do this with a CASE expression if you'd rather keep it single-query
	// and fully set-based — not worth the complexity here).
	rows, err := d.Conn.QueryContext(ctx, `
		SELECT id, sprite_status, sprite_retries, sprite_updated
		FROM monsters
		WHERE sprite_status IN ('processing', 'failed')
		  AND sprite_retries < $1
	`, MaxSpriteRetries)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	now := time.Now()
	var out []SpriteWatchdogCandidate

	for rows.Next() {
		var (
			id      int
			status  string
			retries int
			updated time.Time
		)
		if err := rows.Scan(&id, &status, &retries, &updated); err != nil {
			return nil, err
		}

		due := false
		switch status {
		case "processing":
			due = now.Sub(updated) >= processingTimeout
		case "failed":
			due = now.Sub(updated) >= backoffFn(retries)
		}

		if due {
			out = append(out, SpriteWatchdogCandidate{
				MonsterId:     id,
				SpriteStatus:  status,
				SpriteRetries: retries,
			})
		}
	}

	return out, rows.Err()
}

func (db *DB) SelectSwapPool(ctx context.Context, limit int) ([]Monster, error) {
	monsters := make([]Monster, 0)

	rows, err := db.Conn.QueryContext(ctx, `
SELECT
	id, COALESCE(user_id, 'SWAP_POOL'), experiment_id,
	mint_address, owner_address, stone_mint_address, card_state_address,
	name, height, weight, species, lore,
	movement_class, behaviour, personality, abilities, habitat,
	biome, rarity, stone,
	metadata_uri, image_cid,
	input_url, image_url, thumb_url,
	serial_number, generation, status,
	signature, slot, minted, created
FROM monsters
WHERE status = 'in_pool' AND user_id IS NULL
ORDER BY RANDOM()
LIMIT $1;`, limit)
	if err != nil {
		return monsters, err
	}
	defer rows.Close()

	for rows.Next() {
		var m Monster
		err = rows.Scan(
			&m.Id, &m.UserId, &m.ExperimentId,
			&m.MintAddress, &m.OwnerAddress, &m.StoneMintAddress, &m.CardStateAddress,
			&m.Name, &m.Height, &m.Weight, &m.Species, &m.Lore,
			&m.MovementClass, &m.Behaviour, &m.Personality, &m.Abilities, &m.Habitat,
			&m.Biome, &m.Rarity, &m.Stone,
			&m.MetadataUri, &m.ImageCid,
			&m.InputUrl, &m.ImageUrl, &m.ThumbUrl,
			&m.SerialNumber, &m.Generation, &m.Status,
			&m.Signature, &m.Slot, &m.Minted, &m.Created,
		)
		if err != nil {
			return monsters, err
		}
		monsters = append(monsters, m)
	}
	return monsters, rows.Err()
}

func (db *DB) InsertExperiment(ctx context.Context, e *Experiment) (*Experiment, error) {
	row := db.Conn.QueryRowContext(ctx, `
insert into experiments (
    uuid, user_id,
    input_mime, input_size, input_width, input_height, input_url,
    stone, biome,
    is_test, quality, size
) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
returning
    id, uuid, user_id,
    input_mime, input_size, input_width, input_height, input_url,
    stone, biome,
    is_test, quality, size,
    created
	`,
		e.UUID, e.UserId,
		e.InputMime, e.InputSize, e.InputWidth, e.InputHeight, e.InputUrl,
		e.Stone, e.Biome,
		e.IsTest, e.Quality, e.Size,
	)

	var i Experiment
	if err := row.Scan(
		&i.Id, &i.UUID, &i.UserId,
		&i.InputMime, &i.InputSize, &i.InputWidth, &i.InputHeight, &i.InputUrl,
		&i.Stone, &i.Biome,
		&i.IsTest, &i.Quality, &i.Size,
		&i.Created,
	); err != nil {
		return nil, err
	}
	return &i, nil
}

func (db *DB) UpdateExperiment(ctx context.Context, e *Experiment) (sql.Result, error) {

	var tokensArg interface{}
	if e.TokensUsed != nil {
		b, err := json.Marshal(e.TokensUsed)
		if err != nil {
			return nil, err
		}
		tokensArg = b
	}

	return db.Conn.ExecContext(ctx, `
update experiments set
    rarity                 = $1,
    image_url              = $2,
    thumb_url              = $3,
    generated              = $4,
    uploaded               = $5,
    prompt_analyze_used    = $6,
    prompt_generation_used = $7,
    tokens_used            = $8,
    cost                   = $9
where id = $10
	`,
		e.Rarity,
		e.ImageUrl,
		e.ThumbUrl,
		e.Generated,
		e.Uploaded,
		e.PromptAnalyzeUsed,
		e.PromptGenerationUsed,
		tokensArg,
		e.Cost,
		e.Id,
	)
}

func (db *DB) FinishExperiment(ctx context.Context, e *Experiment) (sql.Result, error) {

	return db.Conn.ExecContext(ctx, `
update experiments set image_cid = $1, metadata_cid = $2, metadata = $3 where id = $4`,
		e.ImageCid,
		e.MetadataCid,
		e.Metadata,
		e.Id,
	)
}

func (db *DB) SelectExperiment(ctx context.Context, id string) (*Experiment, error) {
	row := db.Conn.QueryRowContext(ctx, `
select
    id,
    uuid,
    user_id,
    input_mime,
    input_size,
    input_width,
    input_height,
    input_url,
    image_url,
    thumb_url,
    specimen,
    image_cid,
    metadata_cid,
    metadata,
    stone,
    biome,
    rarity,
    created,
    analyzed,
    generated,
    uploaded,
    minted
from experiments
where id = $1
    `, id)

	e := &Experiment{}
	if err := row.Scan(
		&e.Id,
		&e.UUID,
		&e.UserId,
		&e.InputMime,
		&e.InputSize,
		&e.InputWidth,
		&e.InputHeight,
		&e.InputUrl,
		&e.ImageUrl,
		&e.ThumbUrl,
		&e.Specimen,
		&e.ImageCid,
		&e.MetadataCid,
		&e.Metadata,
		&e.Stone,
		&e.Biome,
		&e.Rarity,
		&e.Created,
		&e.Analyzed,
		&e.Generated,
		&e.Uploaded,
		&e.Minted,
	); err != nil {
		return nil, err
	}
	return e, nil
}

func (db *DB) AnalyzeExperiment(ctx context.Context, e *Experiment) (sql.Result, error) {
	return db.Conn.ExecContext(ctx, `
update experiments set
    specimen = $1,
    analyzed = $2
where id = $3
    `, e.Specimen, e.Analyzed, e.Id)
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
        from monsters where owner_address is not null and status = 'active';`,
	).Scan(&stats.CommonIssued, &stats.RareIssued, &stats.EpicIssued, &stats.MythicIssued, &stats.LegendaryIssued)

	return stats, err
}

func (db *DB) RegisterNotificationIfNew(ctx context.Context, sig string, slot int64) (bool, error) {
	res, err := db.Conn.ExecContext(
		ctx,
		`
        insert into solana_notifications (signature, slot, stage, created)
        values ($1, $2, 'processing', now())
        on conflict (signature) do update
        set
            stage = 'processing', 
            created = now()
        where
            solana_notifications.stage in ('internal_error', 'event_error', 'business_error')
            or 
            (solana_notifications.stage = 'processing' and solana_notifications.created < now() - interval '5 minutes')
        returning id;
        `,
		sig,
		slot,
	)
	if err != nil {
		return false, fmt.Errorf("failed to register/update notification: %w", err)
	}

	rows, err := res.RowsAffected()
	if err != nil {
		return false, err
	}

	return rows > 0, nil
}

func (db *DB) InsertOrder(ctx context.Context, order *Order) error {

	result, err := db.Conn.ExecContext(
		ctx,
		`
insert into orders (id, user_id, product, price, status, stripe_intent_id)
values ($1, $2, $3, $4, 'created', $5)`,
		order.Id.String(),
		order.UserId,
		order.Product,
		order.Price,
		order.StripeIntentId,
	)
	if err != nil {
		return err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}

	if rowsAffected == 0 {
		return fmt.Errorf("no rows inserted")
	}
	return nil
}

func (db *DB) UpdateOrder(ctx context.Context, orderId string, status string) (*Order, error) {
	var order Order

	err := db.Conn.QueryRowContext(ctx, `
        update orders
        set status = $1
        where id = $2 
        returning id, user_id, product, price, status, created
    `, status, orderId).Scan(
		&order.Id,
		&order.UserId,
		&order.Product,
		&order.Price,
		&order.Status,
		&order.Created,
	)

	if err != nil {
		return nil, err
	}

	return &order, nil
}

func (db *DB) SelectPurchases(ctx context.Context, userId string) ([]Purchase, error) {
	var purchases []Purchase
	rows, err := db.Conn.QueryContext(
		ctx,
		`
select id, user_id, order_id, product, status, payload, created, opened
from purchases where user_id = $1 and status = 'sealed' and opened is null;`, userId,
	)
	if err != nil {
		return purchases, err
	}
	defer rows.Close()

	for rows.Next() {
		var purchase Purchase
		err := rows.Scan(
			&purchase.Id,
			&purchase.UserId,
			&purchase.OrderId,
			&purchase.Product,
			&purchase.Status,
			&purchase.Payload,
			&purchase.Created,
			&purchase.Opened,
		)
		if err != nil {
			return purchases, err
		}
		purchases = append(purchases, purchase)
	}
	return purchases, nil
}

func (db *DB) InsertPurchase(ctx context.Context, purchase *Purchase) (*Purchase, error) {
	payloadJson, err := json.Marshal(purchase.Payload)
	if err != nil {
		return nil, fmt.Errorf("marshal payload: %w", err)
	}

	var inserted Purchase
	err = db.Conn.QueryRowContext(
		ctx,
		`insert into purchases (user_id, order_id, product, status, provider, payload)
         values ($1, $2, $3, $4, $5, $6)
         returning id, user_id, order_id, product, status, provider, payload, created, opened`,
		purchase.UserId, purchase.OrderId, purchase.Product, "sealed", purchase.Provider, payloadJson,
	).Scan(
		&inserted.Id,
		&inserted.UserId,
		&inserted.OrderId,
		&inserted.Product,
		&inserted.Status,
		&inserted.Provider,
		&inserted.Payload,
		&inserted.Created,
		&inserted.Opened,
	)

	return &inserted, err
}

func (db *DB) OpenPurchase(ctx context.Context, Id int, userId string) (Purchase, error) {
	var purchase Purchase
	err := db.Conn.QueryRowContext(
		ctx,
		`
with updated_purchase as (
    update purchases
    set status = 'opened', opened = now()
    where id = $1 and user_id = $2 and status = 'sealed'
    returning id
),
inserted_stones as (
    insert into stones (user_id, type, spark_count)
    select p.user_id, kv.key::stone, kv.value::smallint
    from purchases p, jsonb_each_text(p.payload) as kv
    where p.id = $1 and exists (select 1 from updated_purchase)
)
select id, user_id, order_id, product, status, payload, created, opened
from purchases where id = $1 and user_id = $2;`,
		Id, userId,
	).Scan(
		&purchase.Id,
		&purchase.UserId,
		&purchase.OrderId,
		&purchase.Product,
		&purchase.Status,
		&purchase.Payload,
		&purchase.Created,
		&purchase.Opened,
	)
	return purchase, err
}

func (db *DB) UpdateSolanaNotification(ctx context.Context, n *SolanaNotification) error {
	eventsJson, err := json.Marshal(n.Events)
	if err != nil {
		return err
	}

	_, err = db.Conn.ExecContext(
		ctx,
		`
        UPDATE solana_notifications 
        SET stage = $1, 
            logs = $2, 
            events = $3
        WHERE signature = $4
        `,
		n.Stage,
		pq.Array(n.Params.Result.Value.Logs),
		eventsJson,
		n.Params.Result.Value.Signature,
	)

	return err
}

func (db *DB) DecreaseStoneSparksTx(ctx context.Context, tx *sql.Tx, monster *Monster) error {
	result, err := tx.ExecContext(
		ctx,
		`
		update stones
set spark_count = spark_count - 1
where id = (
    select id
    from stones
    where user_id in (select privy_id from users where $1 = any(wallets))
      and type = $2
      and spark_count > 0
    order by spark_count asc
    limit 1
	for update skip locked);`,
		monster.OwnerAddress,
		string(monster.Stone),
	)
	if err != nil {
		return err
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}

	if rowsAffected == 0 {
		return fmt.Errorf("no stone updated for minted monster: %+v", monster)
	}
	return err
}

func (db *DB) InsertMonsterTx(ctx context.Context, tx *sql.Tx, m *Monster) error {
	err := tx.QueryRowContext(
		ctx,
		`
		INSERT INTO monsters (
			user_id,
			experiment_id,
			owner_address,
			name,
			species,
			lore,
			height,
			weight,
			movement_class,
			behaviour,
			personality,
			abilities,
			habitat,
			biome,
			rarity,
			stone,
			serial_number,
			serial_stone,
			serial_biome,
			generation,
			status,
			image_url,
			input_url,
			thumb_url
		) VALUES (
			$1, $2, $3, $4, $5,
			$6, $7, $8, $9, $10,
			$11, $12, $13, $14, $15,
			$16, $17, $18, $19, $20,
			$21, $22, $23, $24
		)
		RETURNING id;
	`,
		m.UserId,
		m.ExperimentId,
		m.OwnerAddress,
		m.Name,
		m.Species,
		m.Lore,
		m.Height,
		m.Weight,
		m.MovementClass,
		m.Behaviour,
		m.Personality,
		m.Abilities,
		m.Habitat,
		m.Biome,
		m.Rarity,
		m.Stone,
		m.SerialNumber,
		m.SerialStone,
		m.SerialBiome,
		m.Generation,
		m.Status,
		m.ImageUrl,
		m.InputUrl,
		m.ThumbUrl,
	).Scan(&m.Id)

	if err != nil {
		return fmt.Errorf("failed to insert monster into db: %w", err)
	}

	return nil
}

func (db *DB) UpdateMonsterStatus(ctx context.Context, experimentId int, status string) error {
	_, err := db.Conn.ExecContext(ctx, `UPDATE monsters  SET status = $1 WHERE experiment_id = $2`, status, experimentId)
	return err
}

func (db *DB) SelectMonsterStatus(ctx context.Context, experimentId int) (string, error) {
	var status string
	err := db.Conn.QueryRowContext(ctx, `SELECT status FROM monsters WHERE experiment_id = $1`, experimentId).Scan(&status)
	if err == sql.ErrNoRows {
		return "not_found", nil
	}
	return status, err
}

func (db *DB) SwapMonsterTx(
	ctx context.Context,
	tx *sql.Tx,
	ownerAddress string,
	lostMint string,
	gainedMint string,
) error {

	res, err := tx.ExecContext(
		ctx,
		`
UPDATE monsters
SET owner_address = NULL, user_id = NULL, status = 'in_pool'
WHERE mint_address = $1
  AND owner_address = $2
  AND status = 'active'
`,
		lostMint,
		ownerAddress,
	)
	if err != nil {
		return err
	}

	affected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if affected != 1 {
		return fmt.Errorf("lost monster not updated")
	}

	res, err = tx.ExecContext(
		ctx,
		`
UPDATE monsters
SET user_id = (select privy_id from users where $1 = any(wallets)), owner_address = $1, status = 'active'
WHERE mint_address = $2
  AND status = 'in_pool'
`,
		ownerAddress,
		gainedMint,
	)
	if err != nil {
		return err
	}

	affected, err = res.RowsAffected()
	if err != nil {
		return err
	}
	if affected != 1 {
		return fmt.Errorf("gained monster not updated")
	}

	return nil
}

func (db *DB) NextSerials(ctx context.Context, tx *sql.Tx, stone StoneType, biome Biome) (global, byStone, byBiome int, err error) {
	err = tx.QueryRowContext(ctx,
		`select
            coalesce(max(serial_number), 0) + 1,
            coalesce(max(case when stone = $1 then serial_stone end), 0) + 1,
            coalesce(max(case when biome = $2 then serial_biome end), 0) + 1
        from monsters`,
		stone, biome,
	).Scan(&global, &byStone, &byBiome)
	return
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

// ── Prompts ───────────────────────────────────────────────────────────────────

func (db *DB) SelectActivePrompt(ctx context.Context) (*PromptPayload, error) {
	row := db.Conn.QueryRowContext(ctx,
		`select payload from prompts where slot = 0`)

	var raw []byte
	if err := row.Scan(&raw); err != nil {
		return nil, err
	}
	var p PromptPayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return nil, err
	}
	return &p, nil
}

func (db *DB) SelectPrompts(ctx context.Context) ([]Prompt, error) {
	rows, err := db.Conn.QueryContext(ctx,
		`select slot, name, payload, updated
         from prompts
         order by slot`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var slots []Prompt
	for rows.Next() {
		var s Prompt
		var raw []byte
		if err := rows.Scan(&s.Slot, &s.Name, &raw, &s.Updated); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(raw, &s.Payload); err != nil {
			return nil, err
		}
		slots = append(slots, s)
	}
	return slots, rows.Err()
}

// UpsertPrompt — slot=0 это активный, slot=1..5 это пресеты
func (db *DB) UpsertPrompt(ctx context.Context, slot int, name string, payload PromptPayload) error {
	raw, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	_, err = db.Conn.ExecContext(ctx, `
insert into prompts (slot, name, payload, updated)
values ($1, $2, $3, now())
on conflict (slot) do update set
    name       = excluded.name,
    payload    = excluded.payload,
    updated = now()
	`, slot, name, raw)
	return err
}

func (db *DB) ClearPrompt(ctx context.Context, slot int) error {
	_, err := db.Conn.ExecContext(ctx,
		`delete from prompts where slot = $1 and slot != 0`,
		slot)
	return err
}

func (db *DB) ActivatePrompt(ctx context.Context, slot int) error {
	_, err := db.Conn.ExecContext(ctx, `
WITH active_slot AS (
    SELECT name, payload FROM prompts WHERE slot = 0
),
target_slot AS (
    SELECT name, payload FROM prompts WHERE slot = $1
)
UPDATE prompts
SET 
    name = CASE 
        WHEN slot = 0 THEN COALESCE((SELECT name FROM target_slot), name)
        WHEN slot = $1 THEN COALESCE((SELECT name FROM active_slot), name)
    END,
    payload = CASE 
        WHEN slot = 0 THEN (SELECT payload FROM target_slot)
        WHEN slot = $1 THEN (SELECT payload FROM active_slot)
    END,
    updated = now()
WHERE slot IN (0, $1);
	`, slot)
	return err
}

// ── Admin experiments gallery ─────────────────────────────────────────────────

func (db *DB) SelectAdminExperiments(ctx context.Context, opts ExperimentFilter) ([]Experiment, int, error) {
	sort := opts.Sort
	order := opts.Order
	allowedSorts := map[string]bool{"created": true, "stone": true, "biome": true, "rarity": true}
	if !allowedSorts[sort] {
		sort = "created"
	}
	if order != "asc" && order != "desc" {
		order = "desc"
	}

	args := []any{}
	conditions := []string{}
	i := 1

	placeholder := func(v any) string {
		args = append(args, v)
		s := fmt.Sprintf("$%d", i)
		i++
		return s
	}

	// is_test filter
	if opts.OnlyTest {
		conditions = append(conditions, "is_test = true")
	}

	// stones
	if len(opts.Stones) > 0 {
		placeholders := make([]string, len(opts.Stones))
		for j, s := range opts.Stones {
			placeholders[j] = placeholder(s)
		}
		conditions = append(conditions, fmt.Sprintf("stone IN (%s)", strings.Join(placeholders, ",")))
	}

	// biomes
	if len(opts.Biomes) > 0 {
		placeholders := make([]string, len(opts.Biomes))
		for j, b := range opts.Biomes {
			placeholders[j] = placeholder(b)
		}
		conditions = append(conditions, fmt.Sprintf("biome IN (%s)", strings.Join(placeholders, ",")))
	}

	// quality
	if len(opts.Qualities) > 0 {
		placeholders := make([]string, len(opts.Qualities))
		for j, q := range opts.Qualities {
			placeholders[j] = placeholder(q)
		}
		conditions = append(conditions, fmt.Sprintf("quality IN (%s)", strings.Join(placeholders, ",")))
	}

	// rarity
	if len(opts.Rarities) > 0 {
		placeholders := make([]string, len(opts.Rarities))
		for j, r := range opts.Rarities {
			placeholders[j] = placeholder(r)
		}
		conditions = append(conditions, fmt.Sprintf("rarity IN (%s)", strings.Join(placeholders, ",")))
	}

	where := ""
	if len(conditions) > 0 {
		where = "WHERE " + strings.Join(conditions, " AND ")
	}

	// only fetch experiments that have finished generating
	if where == "" {
		where = "WHERE image_url IS NOT NULL"
	} else {
		where += " AND image_url IS NOT NULL"
	}

	limitP := placeholder(opts.Limit)
	offsetP := placeholder(opts.Offset)

	query := fmt.Sprintf(`
select
    id, uuid, user_id,
    input_url, image_url, thumb_url,
    stone, biome, rarity,
    is_test, quality, size,
    prompt_analyze_used, prompt_generation_used,
    tokens_used, cost,
    created, analyzed, generated, uploaded
from experiments
%s
order by %s %s
limit %s offset %s
	`, where, sort, order, limitP, offsetP)

	rows, err := db.Conn.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var result []Experiment
	for rows.Next() {
		var e Experiment
		var tokensRaw []byte
		var imageUrl, thumbUrl, rarity sql.NullString
		var promptAnalyze, promptGeneration sql.NullString
		var quality, size sql.NullString // добавь это
		var cost sql.NullFloat64

		if err := rows.Scan(
			&e.Id, &e.UUID, &e.UserId,
			&e.InputUrl, &imageUrl, &thumbUrl,
			&e.Stone, &e.Biome, &rarity,
			&e.IsTest, &quality, &size,
			&promptAnalyze, &promptGeneration,
			&tokensRaw, &cost,
			&e.Created, &e.Analyzed, &e.Generated, &e.Uploaded,
		); err != nil {
			return nil, 0, err
		}

		e.ImageUrl = imageUrl.String
		e.ThumbUrl = thumbUrl.String
		e.Rarity = Rarity(rarity.String)
		e.PromptAnalyzeUsed = promptAnalyze.String
		e.PromptGenerationUsed = promptGeneration.String
		e.Quality = quality.String
		e.Size = size.String
		e.Cost = cost.Float64

		if tokensRaw != nil {
			var t TokensUsed
			if err := json.Unmarshal(tokensRaw, &t); err == nil {
				e.TokensUsed = &t
			}
		}
		result = append(result, e)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}

	// count
	countQuery := fmt.Sprintf(`select count(*) from experiments %s`, where)
	var total int
	if err := db.Conn.QueryRowContext(ctx, countQuery, args[:len(args)-2]...).Scan(&total); err != nil {
		return nil, 0, err
	}

	return result, total, nil
}

func nullable(s string) sql.NullString {
	if s == "" {
		LogWarning("DB", "empty string converted to SQL nullstring")
		return sql.NullString{Valid: false}
	}
	return sql.NullString{String: s, Valid: true}
}

type NullRawMessage json.RawMessage

// Scan реализует интерфейс sql.Scanner для корректного чтения NULL из Postgres
func (n *NullRawMessage) Scan(value any) error {
	if value == nil {
		*n = nil
		return nil
	}

	bytes, ok := value.([]byte)
	if !ok {
		return fmt.Errorf("failed to unmarshal JSONB value: %v", value)
	}

	*n = append((*n)[0:0], bytes...)
	return nil
}

// Value реализует интерфейс driver.Valuer для записи в Postgres
func (n NullRawMessage) Value() (driver.Value, error) {
	if len(n) == 0 {
		return nil, nil
	}
	return []byte(n), nil
}
