create type rarity AS enum (
  'common',
  'rare',
  'epic',
  'mythic',
  'legendary'
);

create type biome AS enum (
  'amazonia',
  'aquatica',
  'plushland',
  'canopica'
);

create type stone AS enum (
    'Quartz',
    'Amazonite',
    'Agate',
    'Ruby',
    'Sapphire',
    'Topaz',
    'Jade'
);

create table if not exists users (
    privy_id text primary key,
    email text,
    wallets text[],
    created timestamptz default now(),
    synced timestamptz default now()
);

create table if not exists experiments (
  id serial primary key,
  user_id text not null references users(privy_id) on delete cascade,
  
  input_mime text not null,
  input_size int not null,
  input_width int not null,
  input_height int not null,
  processed_mime text not null,
  processed_size int not null,
  processed_width int not null,
  processed_height int not null,
  processed_image bytea not null,
  
  specimen jsonb,
  rarity rarity,
  stone stone,
  biome biome,
  image_cid text,
  metadata_cid text,
  metadata jsonb,
  
  created timestamptz default now(),
  analyzed timestamptz,
  generated timestamptz,
  uploaded timestamptz,
  minted timestamptz
);

create table if not exists stones (
    id serial primary key,
    user_id text not null references users(privy_id) on delete cascade,
    mint_address varchar(44) unique not null,
    owner_address varchar(44) not null,
    spark_count smallint not null check (spark_count >= 0),
    type stone not null,
    pda_address varchar(44) unique not null,
    signature varchar(88) unique not null,
    slot bigint not null,
    minted timestamptz not null,
    created timestamptz default now()
);

create table if not exists monsters (
    id serial primary key,
    user_id text references users(privy_id) on delete cascade,
    experiment_id int not null references experiments(id),
    mint_address varchar(44) unique not null,
    owner_address varchar(44),
    stone_mint_address varchar(44) not null,
    card_state_address varchar(44) not null,

    name text not null,
    species text not null,
    lore text not null,
    movement_class text not null,
    behaviour text not null,
    personality text not null,
    abilities text not null,
    habitat text not null,

    biome biome not null,
    rarity rarity not null,
    stone stone not null,
    
    metadata_uri text not null,
    image_cid text not null,

    serial_number int not null,
    generation smallint not null,

    status text not null,
    
    signature varchar(88) unique not null,
    slot bigint not null,

    minted timestamptz not null,
    created timestamptz default now()
);

create table if not exists solana_notifications ( 
  id serial primary key, 
  signature varchar(88) unique not null, 
  slot bigint not null, 
  stage text not null,
  logs text[],
  events jsonb,
  created timestamptz default now()
);

create table if not exists solana_meta (
  last_signature varchar(88) not null,
  updated timestamptz default now()
);

create table if not exists orders (
    id uuid primary key,
    user_id text not null references users(privy_id) on delete cascade,
    product text not null,
    price int not null,
    status text not null check (status IN (
        'created',
        'paid',
        'fulfilled',
        'failed'
    )),
    stripe_intent_id text unique,
    created timestamptz not null default now(),
    paid timestamptz,
    fulfilled timestamptz
);

create table if not exists purchases (
    id serial primary key, 
    user_id text references users(privy_id) on delete cascade,
    order_id uuid references orders(id) on delete cascade,
    product text not null check (product IN (
        'pack10',
        'pack25'
    )),
    status text not null check (status IN (
        'sealed',
        'opened'
    )),
    payload jsonb not null,
    created timestamptz not null default now(),
    opened timestamptz
);