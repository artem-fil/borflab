create table if not exists users (
    privy_id text primary key,
    email text,
    wallet text,
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

    output_image text,
    
    created timestamptz default now(),
    prompted timestamptz,
    finished timestamptz
);