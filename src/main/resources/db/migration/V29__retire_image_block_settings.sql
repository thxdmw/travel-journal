-- 图片区块下线一批版式：通栏出血、瀑布流/杂志版/故事流/错落画廊、
-- 细线描边/相纸白边/浮起阴影/宝丽来/明信片边框、整个色调设置、以及图注的「覆盖底部」。
--
-- 选项从编辑器里撤掉、CSS 也删了，库里存着旧值的老正文就会落进一个空档：设置面板一个
-- 选项都不高亮，渲染又什么都不套。所以在这里一次性搬到保留集合里。搬运表和
-- JournalDocumentService.RETIRED_SETTING_VALUES、frontend/src/journal/document.ts 的那两份
-- 一一对应——那两处管的是作者浏览器本机草稿快照带回来的旧值，这里管的是库里已经存着的，
-- 三处必须同时改。
--
-- 不动 theme_preset：图片区块设置和主题外观已经解耦，主题那边的 image.frame / image.tone /
-- gallery.layout 仍然是完整集合，各自演化。

-- 刻意不动 updated_at：这是结构搬运不是作者编辑，动了会打乱「最近更新」的排序，
-- 也会把 EmptyDraftCleaner 那 24 小时的静默期整体重置一遍。

-- ---------------------------------------------------------------- 日记正文
update journal_entry entry
   set content_json = migrated.content_json
  from (
    select j.id,
           jsonb_set(j.content_json, '{blocks}', coalesce(jsonb_agg(
             case
               when jsonb_typeof(b.block -> 'settings') = 'object'
                 then jsonb_set(b.block, '{settings}',
                        (b.block -> 'settings') - 'tone' || jsonb_strip_nulls(jsonb_build_object(
                          'size', case b.block -> 'settings' ->> 'size'
                                    when 'bleed' then 'full' end,
                          'layout', case b.block -> 'settings' ->> 'layout'
                                      when 'masonry' then 'grid'
                                      when 'story' then 'grid'
                                      when 'staggered' then 'grid'
                                      when 'magazine' then 'mosaic' end,
                          'frame', case b.block -> 'settings' ->> 'frame'
                                     when 'line' then 'none'
                                     when 'paper' then 'none'
                                     when 'float' then 'none'
                                     when 'polaroid' then 'none'
                                     when 'postcard' then 'none' end,
                          'captionPos', case b.block -> 'settings' ->> 'captionPos'
                                          when 'overlay' then '' end)))
               else b.block
             end order by b.ord), '[]'::jsonb)) as content_json
      from journal_entry j
      cross join lateral jsonb_array_elements(j.content_json -> 'blocks') with ordinality as b(block, ord)
     where jsonb_typeof(j.content_json -> 'blocks') = 'array'
     group by j.id, j.content_json
  ) migrated
 where entry.id = migrated.id
   and entry.content_json is distinct from migrated.content_json;

-- ---------------------------------------------------------------- 日记模板
-- 模板块的图片设置存在 config 里，键名和正文那边不同（imageSize / layout）。
-- 顺带把 layout = 'stack' 搬走：它一直在下拉里，却从来不在后端白名单里，选中的模板存不下去。
update journal_template template
   set definition_json = migrated.definition_json
  from (
    select t.id,
           jsonb_set(t.definition_json, '{blocks}', coalesce(jsonb_agg(
             case
               when jsonb_typeof(b.block -> 'config') = 'object'
                 then jsonb_set(b.block, '{config}',
                        (b.block -> 'config') || jsonb_strip_nulls(jsonb_build_object(
                          'imageSize', case b.block -> 'config' ->> 'imageSize'
                                         when 'bleed' then 'full' end,
                          'layout', case b.block -> 'config' ->> 'layout'
                                      when 'masonry' then 'grid'
                                      when 'story' then 'grid'
                                      when 'staggered' then 'grid'
                                      when 'stack' then 'grid'
                                      when 'magazine' then 'mosaic' end)))
               else b.block
             end order by b.ord), '[]'::jsonb)) as definition_json
      from journal_template t
      cross join lateral jsonb_array_elements(t.definition_json -> 'blocks') with ordinality as b(block, ord)
     where jsonb_typeof(t.definition_json -> 'blocks') = 'array'
     group by t.id, t.definition_json
  ) migrated
 where template.id = migrated.id
   and template.definition_json is distinct from migrated.definition_json;
