-- 下线「三亚海风」基础主题，并为自定义主题引入可上传的首页封面图。
--
-- 三亚海风原本是和 travel-classic 并列的第二套基础视觉，它只额外提供了一张首页 hero 图；
-- 现在 hero 图改成每套自定义主题自己上传（definition_json.hero.mediaId），
-- 这套基础主题就没有存在意义了，连同它的 CSS 和图片一起移除。

-- 1. 先把所有指向它的引用改掉，再删预设行，避免留下悬空的 theme_key。
--    全站主题回落到默认主题；旅行和日记的专属主题置空，表示继承上层主题。
update admin_user set theme_key = 'travel-classic' where theme_key = 'sanya-breeze';
update trip set theme_key = null where theme_key = 'sanya-breeze';
update journal_entry set theme_key = null where theme_key = 'sanya-breeze';

-- 2. 兜底：以三亚海风为基础视觉的自定义主题改挂到 travel-classic。
--    目前库里没有自定义主题，这句通常是空操作，留着是防止部署前临时建了主题。
update theme_preset set base_theme_key = 'travel-classic' where base_theme_key = 'sanya-breeze';

-- 3. 删除预设本身。用 theme_key 而不是 id，避免依赖 V4 里的自增值。
delete from theme_preset where theme_key = 'sanya-breeze' and builtin = true;

comment on column theme_preset.base_theme_key is '基础视觉，目前仅 travel-classic，负责封面版式和 CSS 兜底';
comment on column theme_preset.definition_json is '主题配置 JSON，含 colors/typography/shape/layout/image/motion/hero 七个白名单区块';
