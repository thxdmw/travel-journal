-- 所有系统主题的首页布局统一成「整齐卡片」。
--
-- 内置主题此前每套各挑一种首页版式（旅行杂志、Bento 格、杂志栅格、时间轴、瀑布流），
-- 换主题时首页的骨架跟着一起变。主题该负责的是颜色、字体、图片风格这些「气质」，
-- 首页能不能一眼看完是另一回事——参差的版式在手机上尤其难扫读。
--
-- 只改官方定义（builtin = true 的 definition_json）。override_json 是用户自己在设计器里
-- 改过的那部分，属于他的选择，这里不碰：他要是特意把某套主题的首页调成了瀑布流，
-- 这次迁移之后仍然是瀑布流。

update theme_preset
   set definition_json = jsonb_set(definition_json, '{layout,homeLayout}', '"classic"'::jsonb, true),
       updated_at = now()
 where builtin = true
   and definition_json -> 'layout' ->> 'homeLayout' is distinct from 'classic';
