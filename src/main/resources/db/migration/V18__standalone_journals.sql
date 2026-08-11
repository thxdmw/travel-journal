-- 日记可以先写、以后再归入旅行；现有外键保留，已归入旅行的日记语义不变。
alter table journal_entry
    alter column trip_id drop not null;

comment on column journal_entry.trip_id is '可选的所属旅行；为空表示独立日记';
