-- 系统主题从「只读」改为「官方默认 + 用户覆盖」两层模型：definition_json 继续是
-- 官方值，永远不被直接改写；用户在系统主题上做的修改存进这一列，且只存相对官方值
-- 发生变化的字段（稀疏 override）。这样官方主题以后升级时，用户没碰过的字段能自动
-- 继承新值，碰过的字段继续保留用户自己的选择——不需要额外写升级迁移逻辑。
--
-- 只对 builtin = true 的行有意义；个人主题（复制出来的那些）不使用这一列，
-- 继续和以前一样直接编辑 definition_json。
alter table theme_preset add column override_json jsonb;

comment on column theme_preset.override_json is '系统主题的用户覆盖（稀疏 JSON，只含改动过的字段）；个人主题不使用，恒为 null';
