-- 主题外观不再管图片长什么样。
--
-- 「图片默认版式」和「多图布局」两组、形状里的图片圆角、互动里的鼠标经过照片，
-- 都和日记里逐张配置的图片设置重叠。两套设置并存时，作者在主题里改一下看不出变化
-- （逐张设过的优先），那种「到底是谁说了算」的场合永远解释不清。现在只留逐张配置一套，
-- 主题负责颜色、字体、卡片、背景这些真正的「气质」。
--
-- SCHEMA 里已经没有这些 token，用户 override 下次保存时会被 normalizeDefinition 自然丢掉；
-- 但 builtin 预设的 definition_json 不走那条路，不在这里清就会一直留着并继续铺成
-- <html> 上的 data-* 属性（CSS 已经删了，属性还在，纯属脏数据）。两边一起清。

update theme_preset
   set definition_json = (definition_json - 'image' - 'gallery')
         || case when definition_json ? 'shape'
                 then jsonb_build_object('shape', (definition_json -> 'shape') - 'imageRadius')
                 else '{}'::jsonb end
         || case when definition_json ? 'interactions'
                 then jsonb_build_object('interactions', (definition_json -> 'interactions') - 'imageHover')
                 else '{}'::jsonb end,
       updated_at = now()
 where definition_json ?| array['image', 'gallery']
    or definition_json -> 'shape' ? 'imageRadius'
    or definition_json -> 'interactions' ? 'imageHover';

update theme_preset
   set override_json = (override_json - 'image' - 'gallery')
         || case when override_json ? 'shape'
                 then jsonb_build_object('shape', (override_json -> 'shape') - 'imageRadius')
                 else '{}'::jsonb end
         || case when override_json ? 'interactions'
                 then jsonb_build_object('interactions', (override_json -> 'interactions') - 'imageHover')
                 else '{}'::jsonb end,
       updated_at = now()
 where override_json is not null
   and (override_json ?| array['image', 'gallery']
    or override_json -> 'shape' ? 'imageRadius'
    or override_json -> 'interactions' ? 'imageHover');
