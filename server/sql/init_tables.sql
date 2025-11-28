create type rarity AS enum (
  'common',
  'rare',
  'epic',
  'mythic',
  'legendary'
);

create table if not exists users (
    privy_id text primary key,
    email text,
    wallet text,
    created timestamptz default now(),
    synced timestamptz default now()
);

create table if not exists monsters (
    id serial primary key,
    user_id text not null references users(privy_id) on delete cascade,

    rarity rarity not null,

    image_cid text,
    metadata_cid text,
    metadata jsonb,
    
    created timestamptz default now()
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

    monster_id int references monsters(id) on delete cascade,
    
    created timestamptz default now(),
    analyzed timestamptz,
    generated timestamptz,
    uploaded timestamptz,
    minted timestamptz
);
