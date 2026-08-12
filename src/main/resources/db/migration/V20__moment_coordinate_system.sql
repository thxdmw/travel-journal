-- moment 补一个坐标系标记，和 trip_stop 的 coordinate_system 是同一个概念，
-- 但默认值刻意相反：trip_stop 的坐标来自高德搜索/逆地理编码/旧版栅格瓦片选点，
-- 都是 GCJ-02；moment 的坐标只有一条来源——设备 GPS 或照片 EXIF GPS
-- （navigator.geolocation / EXIF 标准），按规范恒定输出 WGS84。
--
-- 现有历史行不做任何数值转换，只是把它们本来就是的坐标系明确标注出来。
alter table moment add column coordinate_system varchar(20) not null default 'WGS84';

comment on column moment.coordinate_system is '坐标系，恒为 WGS84（设备 GPS / 照片 EXIF GPS 按规范直接输出 WGS84）';
