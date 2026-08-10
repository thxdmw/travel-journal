-- 盛夏出逃的日记正文栏改回常规宽度。
--
-- V12 给这套主题设了 journalLayout = wide，让日记正文用 contentWidth（1240px）
-- 而不是 articleWidth（760px）。当时想要的是「通透、开阔」，但代价没算清楚：
--
--   1. 正文一行约 60 个中文字，远超舒适阅读宽度，读起来要来回扫
--   2. 图片宽度是按正文栏百分比算的，正文栏宽了近一倍，图跟着大一倍——
--      选了「小图」的单张照片仍然有 521px，一张竖拍照片能占掉大半屏
--
-- 六套主题里只有这一套是 wide，其余五套都是 single；夏季的辨识度本来就来自
-- 配色、光斑和波浪底边，不需要靠拉宽正文来营造。
--
-- 用 jsonb_set 精确改这一个键，不动 layout 里的其他值，也不影响作者
-- 复制这套主题后自己改出来的个人主题。
update theme_preset set
    definition_json = jsonb_set(definition_json, '{layout,journalLayout}', '"single"'),
    version = version + 1,
    updated_at = now()
 where theme_key = 'preset-summer'
   and definition_json #>> '{layout,journalLayout}' = 'wide';
