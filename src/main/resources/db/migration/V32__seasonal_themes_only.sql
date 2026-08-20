-- 系统主题收敛到春夏秋冬四套，「远行手记」和「复古」下线。
--
-- 为什么砍这两套：四季主题是这个站点的主线玩法——跟随季节自动轮换，作者什么都不用做。
-- 远行手记和复古待在同一个列表里，却不参与轮换，选中任何一套都等于把季节感永久关掉，
-- 而它们能提供的视觉，四季里各有更完整的表达（复古的年代感和秋日远行的旧纸车票高度重合）。
--
-- 「远行手记」这个 theme_key 一直身兼两职：既是列表里的一套预设，又是所有主题的 CSS 底座
-- （base_theme_key、data-theme 上挂的那个值、变量兜底）。下线的是前者；后者改名成中性的
-- base 继续留着，否则每套主题的 CSS 变量都没有兜底值。

-- ── 1. 先解除引用，再删预设 ────────────────────────────────────
-- 顺序不能反：主题可能正被全站、某次旅行或某篇日记引用，先删预设会让那些页面失去视觉。

-- 全站主题指向这两套的账号，改回「跟随季节」——这正是它们下线之后该有的样子，
-- 而不是硬塞一套春天给一个可能正在过冬的站点。
--
-- theme_key 顺带改成可空。AUTO 模式下这一列压根不被读（siteThemeState 走的是当前季节），
-- 硬塞一个值进去只会让库里写着「春」而页面显示「秋」，排查时先骗自己一轮。
-- trip 和 journal_entry 的同名列本来就是可空的，语义就是「没有特别指定」。
alter table admin_user alter column theme_key drop not null;
update admin_user
   set theme_key = null, theme_mode = 'AUTO'
 where theme_key in ('travel-classic', 'preset-retro');

-- 旅行和日记的专属主题置空 = 继承上层主题，语义上就是「没有特别指定」。
update trip set theme_key = null where theme_key in ('travel-classic', 'preset-retro');
update journal_entry set theme_key = null where theme_key in ('travel-classic', 'preset-retro');

delete from theme_preset where theme_key in ('travel-classic', 'preset-retro');

-- ── 2. 基础视觉改名 travel-classic → base ──────────────────────
-- 留着旧名字就等于「远行手记」还在代码和数据里活着，而它已经不是一套可选主题了。
alter table admin_user alter column theme_key drop default;
comment on column admin_user.theme_key is '全站固定主题；为空表示没挑过，配合 theme_mode=AUTO 跟随季节';
alter table theme_preset alter column base_theme_key set default 'base';
update theme_preset set base_theme_key = 'base' where base_theme_key = 'travel-classic';
comment on column theme_preset.base_theme_key is '基础视觉，目前仅 base，负责封面版式和 CSS 兜底';

-- ── 3. 复古专属的取值 ──────────────────────────────────────────
-- journalMoment 的 retro 档（邮戳开场、虚线章节）随主题一起下线，对应 CSS 也删了。
-- 留着的话，自定义主题选中它会落进「选项还在、渲染什么都不套」的空档。
-- 搬到 classic：它是这个 token 的默认档，不是某一套主题。
update theme_preset
   set definition_json = jsonb_set(definition_json, '{blockStyles,journalMoment}', '"classic"', true)
 where definition_json -> 'blockStyles' ->> 'journalMoment' = 'retro';
update theme_preset
   set override_json = jsonb_set(override_json, '{blockStyles,journalMoment}', '"classic"', true)
 where override_json -> 'blockStyles' ->> 'journalMoment' = 'retro';

-- 复古那组贴纸素材（邮票、邮戳、飞机、护照）连同 SVG 一并删了，
-- 自定义主题里引用到它们的项要摘掉，否则页面上是四个碎图。
update theme_preset preset
   set definition_json = migrated.definition_json
  from (
    select p.id,
           jsonb_set(p.definition_json, '{stickers,items}', coalesce(jsonb_agg(
             s.item order by s.ord) filter (where s.item ->> 'asset' not like 'retro-%'), '[]'::jsonb)) as definition_json
      from theme_preset p
      cross join lateral jsonb_array_elements(p.definition_json -> 'stickers' -> 'items') with ordinality as s(item, ord)
     where jsonb_typeof(p.definition_json -> 'stickers' -> 'items') = 'array'
     group by p.id, p.definition_json
  ) migrated
 where preset.id = migrated.id
   and preset.definition_json is distinct from migrated.definition_json;

update theme_preset preset
   set override_json = migrated.override_json
  from (
    select p.id,
           jsonb_set(p.override_json, '{stickers,items}', coalesce(jsonb_agg(
             s.item order by s.ord) filter (where s.item ->> 'asset' not like 'retro-%'), '[]'::jsonb)) as override_json
      from theme_preset p
      cross join lateral jsonb_array_elements(p.override_json -> 'stickers' -> 'items') with ordinality as s(item, ord)
     where jsonb_typeof(p.override_json -> 'stickers' -> 'items') = 'array'
     group by p.id, p.override_json
  ) migrated
 where preset.id = migrated.id
   and preset.override_json is distinct from migrated.override_json;

-- 远行手记的预览图（1.9MB 的京都封面）随预设一起下线，静态文件也删了。
update theme_preset set preview_image_url = null
 where preview_image_url like '/img/theme-travel-classic-preview%';
