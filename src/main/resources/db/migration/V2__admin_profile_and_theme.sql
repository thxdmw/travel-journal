alter table admin_user
    add column avatar_object_key varchar(512),
    add column theme_key varchar(64) not null default 'travel-classic';
