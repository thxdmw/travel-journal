-- 照片的拍摄元信息。
--
-- 用途：上传后按拍摄时间自动排序（而不是按上传顺序），以及根据 GPS 推荐该挂到哪个城市。
-- 这些信息本来就在 JPEG 的 EXIF 里，MediaService 读方向信息时顺手就能拿到，
-- 不落库的话每次用都要重新解一遍原图。

alter table media_asset
    add column captured_at timestamptz,
    add column gps_latitude numeric(9,6),
    add column gps_longitude numeric(9,6);

comment on column media_asset.captured_at is '拍摄时间，来自 EXIF DateTimeOriginal，缺失时为空';
comment on column media_asset.gps_latitude is '拍摄纬度，来自 EXIF GPS，缺失时为空';
comment on column media_asset.gps_longitude is '拍摄经度，来自 EXIF GPS，缺失时为空';

-- 按拍摄时间排序照片时用。多数照片有 EXIF 时间，没有的排在最后，所以建部分索引。
create index idx_media_asset_captured_at on media_asset(captured_at) where captured_at is not null;
