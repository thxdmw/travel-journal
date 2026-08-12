-- 不改任何历史坐标值，只把以后绕过应用层直接 INSERT 时的数据库默认值改成领域标准 WGS84。
-- 历史行仍保留原 coordinate_system，读取时按明确元数据转换；待来源核实后才能另做数据迁移。
alter table trip_stop alter column coordinate_system set default 'WGS84';

comment on column trip_stop.coordinate_system is
    '坐标系；新数据统一 WGS84，历史数据可保留 GCJ02 并在读取边界按元数据转换';
