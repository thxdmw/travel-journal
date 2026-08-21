-- 主题设置做减法：删掉一批「调了也说不清好在哪」的可调项。
--
-- 下线的是：字体与排版里的正文字号、标题字重、段间距；圆角与描边里的描边粗细；
-- 页面布局里的内容宽度、文章宽度、区块间距倍数、内容密度；以及整组卡片风格。
-- 首页布局只留「整齐卡片 / 旅行杂志」，日记布局只留「标准单栏 / 宽栏」，
-- 其余版式（Bento、杂志栅格、时间轴、瀑布流、沉浸式、手账式）一并收敛。
--
-- 和 V30 一个道理：SCHEMA 里没有的 token，用户 override 下次保存时会被
-- normalizeDefinition 丢掉，但 builtin 预设的 definition_json 不走那条路，
-- 不在这里清就会一直铺成 <html> 上的 data-* 属性和 CSS 变量——而 CSS 已经删了对应实现。

-- 第一步：删掉不再开放的 token。
update theme_preset
   set definition_json = (definition_json - 'card')
         || case when definition_json ? 'typography'
                 then jsonb_build_object('typography',
                        (definition_json -> 'typography') - 'bodySize' - 'headingWeight' - 'paragraphSpacing')
                 else '{}'::jsonb end
         || case when definition_json ? 'shape'
                 then jsonb_build_object('shape', (definition_json -> 'shape') - 'borderWidth')
                 else '{}'::jsonb end
         || case when definition_json ? 'layout'
                 then jsonb_build_object('layout',
                        (definition_json -> 'layout') - 'contentWidth' - 'articleWidth' - 'sectionGap' - 'density')
                 else '{}'::jsonb end,
       updated_at = now()
 where definition_json ? 'card'
    or definition_json -> 'typography' ?| array['bodySize', 'headingWeight', 'paragraphSpacing']
    or definition_json -> 'shape' ? 'borderWidth'
    or definition_json -> 'layout' ?| array['contentWidth', 'articleWidth', 'sectionGap', 'density'];

update theme_preset
   set override_json = (override_json - 'card')
         || case when override_json ? 'typography'
                 then jsonb_build_object('typography',
                        (override_json -> 'typography') - 'bodySize' - 'headingWeight' - 'paragraphSpacing')
                 else '{}'::jsonb end
         || case when override_json ? 'shape'
                 then jsonb_build_object('shape', (override_json -> 'shape') - 'borderWidth')
                 else '{}'::jsonb end
         || case when override_json ? 'layout'
                 then jsonb_build_object('layout',
                        (override_json -> 'layout') - 'contentWidth' - 'articleWidth' - 'sectionGap' - 'density')
                 else '{}'::jsonb end,
       updated_at = now()
 where override_json is not null
   and (override_json ? 'card'
     or override_json -> 'typography' ?| array['bodySize', 'headingWeight', 'paragraphSpacing']
     or override_json -> 'shape' ? 'borderWidth'
     or override_json -> 'layout' ?| array['contentWidth', 'articleWidth', 'sectionGap', 'density']);

-- 第二步：把下线的版式收敛到还留着的那两个。
-- 只改本来就有这个键的主题，没写过版式的保持没写，让后端默认值接着兜。
update theme_preset
   set definition_json = jsonb_set(definition_json, '{layout,homeLayout}', '"editorial"'::jsonb),
       updated_at = now()
 where definition_json -> 'layout' ? 'homeLayout'
   and definition_json -> 'layout' ->> 'homeLayout' not in ('classic', 'editorial');

update theme_preset
   set definition_json = jsonb_set(definition_json, '{layout,journalLayout}', '"single"'::jsonb),
       updated_at = now()
 where definition_json -> 'layout' ? 'journalLayout'
   and definition_json -> 'layout' ->> 'journalLayout' not in ('single', 'wide');

update theme_preset
   set override_json = jsonb_set(override_json, '{layout,homeLayout}', '"editorial"'::jsonb),
       updated_at = now()
 where override_json -> 'layout' ? 'homeLayout'
   and override_json -> 'layout' ->> 'homeLayout' not in ('classic', 'editorial');

update theme_preset
   set override_json = jsonb_set(override_json, '{layout,journalLayout}', '"single"'::jsonb),
       updated_at = now()
 where override_json -> 'layout' ? 'journalLayout'
   and override_json -> 'layout' ->> 'journalLayout' not in ('single', 'wide');
