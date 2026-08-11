-- 随手记离线队列与发生地日期。
-- client_id 让浏览器断线重试时可以安全重放创建请求；发生地日期独立于站点时区，
-- 避免人在东京凌晨记下的事情被上海站点时钟归到前一天。

alter table moment add column client_id varchar(80);
alter table moment add column occurred_local_date date;
alter table moment add column occurred_zone_id varchar(80);
alter table moment add column utc_offset_minutes smallint;

update moment
set occurred_local_date = (occurred_at at time zone 'Asia/Shanghai')::date,
    occurred_zone_id = 'Asia/Shanghai',
    utc_offset_minutes = 480
where occurred_local_date is null;

alter table moment alter column occurred_local_date set not null;
alter table moment alter column occurred_zone_id set not null;
alter table moment alter column utc_offset_minutes set not null;
alter table moment add constraint ck_moment_utc_offset
    check (utc_offset_minutes between -1080 and 1080);

create unique index uq_moment_trip_client_id
    on moment(trip_id, client_id) where client_id is not null;
create index idx_moment_trip_local_date
    on moment(trip_id, occurred_local_date, occurred_at desc);

comment on column moment.client_id is '客户端幂等键；离线队列重放创建请求时保持不变';
comment on column moment.occurred_local_date is '事情发生地的当地日期，用于按天分组和整理';
comment on column moment.occurred_zone_id is '事情发生地的 IANA 时区，例如 Asia/Tokyo';
comment on column moment.utc_offset_minutes is '发生时刻相对 UTC 的分钟偏移，时区不可识别时的稳定后备值';

alter table moment_media add column client_id varchar(80);
create unique index uq_moment_media_client_id
    on moment_media(moment_id, client_id) where client_id is not null;
comment on column moment_media.client_id is '离线照片的客户端幂等键；重试上传时避免重复图片';
