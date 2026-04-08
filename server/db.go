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

func (db *DB) UpsertUser(ctx context.Context, u *User) (*User, bool, error) {
	row := db.Conn.QueryRowContext(
		ctx,
		`
insert into users (privy_id, email, wallets, created, synced)
values ($1, $2, $3, now(), now())
on conflict (privy_id)
do update set
	email = excluded.email,
	wallets = excluded.wallets,
	synced = now()
returning
	privy_id,
	email,
	wallets,
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
	id,
	user_id,
	experiment_id,
	mint_address,
	owner_address,
	stone_mint_address,
	card_state_address,
	name,
	height,
	weight,
	species,
	lore,
	movement_class,
	behaviour,
	personality,
	abilities,
	habitat,
	biome,
	rarity,
	stone,
	metadata_uri,
	image_cid,
	serial_number,
	generation,
	status,
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
			&monster.Height,
			&monster.Weight,
			&monster.Species,
			&monster.Lore,
			&monster.MovementClass,
			&monster.Behaviour,
			&monster.Personality,
			&monster.Abilities,
			&monster.Habitat,
			&monster.Biome,
			&monster.Rarity,
			&monster.Stone,
			&monster.MetadataUri,
			&monster.ImageCid,
			&monster.SerialNumber,
			&monster.Generation,
			&monster.Status,
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

func (db *DB) SelectMonster(ctx context.Context, mintAddress string, userId string) (Monster, error) {
	var monster Monster
	err := db.Conn.QueryRowContext(
		ctx,
		`
select
	id,
	user_id,
	experiment_id,
	mint_address,
	owner_address,
	stone_mint_address,
	card_state_address,
	name,
	height,
	weight,
	species,
	lore,
	movement_class,
	behaviour,
	personality,
	abilities,
	habitat,
	biome,
	rarity,
	stone,
	metadata_uri,
	image_cid,
	serial_number,
	generation,
	status,
	signature,
	slot,
	minted,
	created
from monsters where mint_address = $1 and user_id = $2;`, mintAddress, userId).Scan(
		&monster.Id,
		&monster.UserId,
		&monster.ExperimentId,
		&monster.MintAddress,
		&monster.OwnerAddress,
		&monster.StoneMintAddress,
		&monster.CardStateAddress,
		&monster.Name,
		&monster.Height,
		&monster.Weight,
		&monster.Species,
		&monster.Lore,
		&monster.MovementClass,
		&monster.Behaviour,
		&monster.Personality,
		&monster.Abilities,
		&monster.Habitat,
		&monster.Biome,
		&monster.Rarity,
		&monster.Stone,
		&monster.MetadataUri,
		&monster.ImageCid,
		&monster.SerialNumber,
		&monster.Generation,
		&monster.Status,
		&monster.Signature,
		&monster.Slot,
		&monster.Minted,
		&monster.Created,
	)
	if err != nil {
		return monster, err
	}
	return monster, err
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
    set 
        status = 'opened', 
        opened = now()
    where id = $1 
      and user_id = $2 
      and status = 'sealed'
    returning id, user_id, order_id, product, status, payload, created, opened
),
inserted_stones as (
    insert into stones (user_id, type, spark_count)
    select 
        p.user_id, 
        kv.key::stone,
        kv.value::smallint
    from updated_purchase p, 
    jsonb_each_text(p.payload) as kv
)
select * from updated_purchase;`,
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

func (db *DB) InsertMonsterTx(ctx context.Context, tx *sql.Tx, monster *Monster) error {
	result, err := tx.ExecContext(
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
	height,
	weight,
	species,
	lore,
	movement_class,
	behaviour,
	personality,
	abilities,
	habitat,
	biome,
	rarity,
	stone,
	metadata_uri,
	image_cid,
	serial_number,
	generation,
	status,
	signature,
	slot,
	minted
) values ((select privy_id from users where $1 = any(wallets)), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
on conflict (signature) do nothing
		`,
		monster.OwnerAddress,
		monster.ExperimentId,
		monster.MintAddress,
		monster.OwnerAddress,
		monster.StoneMintAddress,
		monster.CardStateAddress,
		monster.Name,
		monster.Height,
		monster.Weight,
		monster.Species,
		monster.Lore,
		monster.MovementClass,
		monster.Behaviour,
		monster.Personality,
		monster.Abilities,
		monster.Habitat,
		monster.Biome,
		monster.Rarity,
		monster.Stone,
		monster.MetadataUri,
		monster.ImageCid,
		monster.SerialNumber,
		monster.Generation,
		monster.Status,
		monster.Signature,
		monster.Slot,
		monster.Minted,
	)
	if err != nil {
		return err
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}

	if rowsAffected == 0 {
		return fmt.Errorf("no rows insert for monster: %s", monster.MintAddress)
	}
	return err
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
