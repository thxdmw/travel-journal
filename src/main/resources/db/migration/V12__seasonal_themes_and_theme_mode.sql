-- 主题体系 V2：系统预设收敛成六套，并引入「跟随季节 / 固定」两种全站主题模式。
--
-- 为什么要砍：V7 一口气铺了九套预设，加上远行经典就是十套，选择列表长得看不完，
-- 而其中大半只是换了配色，辨识度并不够撑起一个独立主题。留下的六套各自有明确的场合：
--   远行经典  没有特别想法时永远不会出错的品牌视觉
--   复古      旧旅行时代：邮戳、车票、老地图
--   春夏秋冬  四套完整的季节语言，跟着站点所在地的季节自动轮换
-- 想玩别的风格走「复制主题后自己改」，系统预设只负责最有辨识度的那几种。

-- ── 全站主题模式 ────────────────────────────────────────────────
-- AUTO：跟随季节，春夏秋冬到点自动切换，作者什么都不用做
-- FIXED：作者手动选定了某一套，季节变化不再影响它
-- 默认给 AUTO，但下面会把已经手动选过非默认主题的账号保留成 FIXED——
-- 迁移不该把别人挑好的主题悄悄换掉。
alter table admin_user
    add column theme_mode varchar(16) not null default 'AUTO';
comment on column admin_user.theme_mode is '全站主题模式：AUTO 跟随季节，FIXED 使用 theme_key 指定的主题';

update admin_user set theme_mode = 'FIXED'
 where theme_key is not null and theme_key <> 'travel-classic';

-- ── 四套季节主题 ────────────────────────────────────────────────
-- 每套都覆盖全部 token 区块，而不只是配色：背景纹理、卡片质感、相框、图片色调、
-- 图片组排版、动效、页面特效和地图风格一起变，切换季节才会「一眼就是那个季节」。
insert into theme_preset
    (theme_key, name, description, base_theme_key, preview_image_url, definition_json, builtin, enabled, version)
values
    ('preset-spring', '春日漫游', '奶白与浅樱粉，纸张纹理上偶尔飘过几片花瓣，像春天出门散步。', 'travel-classic', null,
     '{"colors":{"background":"#FDFBF7","surface":"#FFFFFF","surfaceSoft":"#F7EFF0","primary":"#4A5D4E","primarySoft":"#6E8272","secondary":"#C98BA0","accent":"#D98CA6","accentHover":"#C4738E","sand":"#F0DCE0","text":"#4A4540","muted":"#918A82","border":"#EADFE0","danger":"#C25F5A","scheme":"light","gradientFrom":"#FDFBF7","gradientTo":"#F5EDF0"},"typography":{"headingFamily":"serif","bodyFamily":"sans","bodySize":16,"lineHeight":1.9,"letterSpacing":0.01,"headingWeight":600,"paragraphSpacing":1.35,"headingStyle":"plain"},"shape":{"cardRadius":14,"imageRadius":10,"buttonRadius":18,"borderWidth":1},"layout":{"contentWidth":1180,"articleWidth":740,"sectionGap":1.2,"density":"comfortable","homeLayout":"editorial","journalLayout":"single"},"card":{"style":"border","opacity":1,"blur":0},"background":{"style":"solid","texture":"paper","intensity":0.28},"image":{"style":"rounded","shadow":"soft","defaultRatio":"4:3","frame":"line","tone":"none","width":"medium","maxHeight":72},"gallery":{"layout":"masonry","columns":3,"gap":12},"motion":{"level":"subtle","hover":"lift","entrance":true,"scrollReveal":true},"effects":{"particles":"sakura","grain":false,"lightLeak":false,"vignette":false},"map":{"style":"light","routeColor":"#8FB585","routeWidth":3,"markerStyle":"pin","animateRoute":true},"hero":{}}'::jsonb,
     true, true, 1),
    ('preset-summer', '盛夏出逃', '天空蓝配柠檬黄，通透明亮带空气感，一打开就想出门。', 'travel-classic', null,
     '{"colors":{"background":"#FCFCF8","surface":"#FFFFFF","surfaceSoft":"#E8F4FA","primary":"#1B5E78","primarySoft":"#3E829B","secondary":"#7FBF6A","accent":"#2E9BC9","accentHover":"#1F82AC","sand":"#F5D547","text":"#22333B","muted":"#6E8391","border":"#D5E7F0","danger":"#D9573F","scheme":"light","gradientFrom":"#DCEFF9","gradientTo":"#FCFCF8"},"typography":{"headingFamily":"rounded","bodyFamily":"sans","bodySize":16,"lineHeight":1.8,"letterSpacing":0,"headingWeight":700,"paragraphSpacing":1.25,"headingStyle":"bar"},"shape":{"cardRadius":16,"imageRadius":14,"buttonRadius":24,"borderWidth":0},"layout":{"contentWidth":1240,"articleWidth":760,"sectionGap":1.15,"density":"comfortable","homeLayout":"bento","journalLayout":"wide"},"card":{"style":"shadow","opacity":1,"blur":0},"background":{"style":"gradient","texture":"none","intensity":0.35},"image":{"style":"rounded","shadow":"floating","defaultRatio":"16:9","frame":"float","tone":"none","width":"large","maxHeight":78},"gallery":{"layout":"mosaic","columns":3,"gap":12},"motion":{"level":"standard","hover":"zoom","entrance":true,"scrollReveal":true},"effects":{"particles":"none","grain":false,"lightLeak":true,"vignette":false},"map":{"style":"light","routeColor":"#2E9BC9","routeWidth":4,"markerStyle":"ring","animateRoute":true},"hero":{}}'::jsonb,
     true, true, 1),
    ('preset-autumn', '秋日远行', '奶油底、焦糖与枫红，旧纸和颗粒感，像坐火车回来整理照片。', 'travel-classic', null,
     '{"colors":{"background":"#F7F0E3","surface":"#FFFAF0","surfaceSoft":"#EDE0CB","primary":"#4A3728","primarySoft":"#6B5340","secondary":"#6E7A4E","accent":"#C67A3E","accentHover":"#A8632D","sand":"#DCC69C","text":"#3E3226","muted":"#8A7A64","border":"#DCCBAE","danger":"#B4462F","scheme":"light","gradientFrom":"#F7F0E3","gradientTo":"#EFE2CB"},"typography":{"headingFamily":"serif","bodyFamily":"serif","bodySize":17,"lineHeight":1.85,"letterSpacing":0.02,"headingWeight":700,"paragraphSpacing":1.3,"headingStyle":"bar"},"shape":{"cardRadius":6,"imageRadius":4,"buttonRadius":6,"borderWidth":1},"layout":{"contentWidth":1160,"articleWidth":720,"sectionGap":1.2,"density":"comfortable","homeLayout":"timeline","journalLayout":"single"},"card":{"style":"paper","opacity":1,"blur":0},"background":{"style":"solid","texture":"paper","intensity":0.5},"image":{"style":"paper","shadow":"soft","defaultRatio":"4:3","frame":"postcard","tone":"warm","width":"medium","maxHeight":72},"gallery":{"layout":"grid","columns":2,"gap":16},"motion":{"level":"standard","hover":"tilt","entrance":true,"scrollReveal":true},"effects":{"particles":"leaves","grain":true,"lightLeak":false,"vignette":false},"map":{"style":"vintage","routeColor":"#B4462F","routeWidth":4,"markerStyle":"pin","animateRoute":true},"hero":{}}'::jsonb,
     true, true, 1),
    ('preset-winter', '冬日旅途', '雪白与深夜蓝，冷色环境里留一点暖橙灯光。', 'travel-classic', null,
     '{"colors":{"background":"#F7FAFC","surface":"#FFFFFF","surfaceSoft":"#E7EFF5","primary":"#1E3049","primarySoft":"#3D5876","secondary":"#7C93A6","accent":"#E8944A","accentHover":"#CE7A32","sand":"#C6D2DA","text":"#22303D","muted":"#7B8B99","border":"#D8E3EB","danger":"#C4564A","scheme":"light","gradientFrom":"#EDF4F9","gradientTo":"#F9FBFC"},"typography":{"headingFamily":"serif","bodyFamily":"sans","bodySize":16,"lineHeight":1.9,"letterSpacing":0.01,"headingWeight":600,"paragraphSpacing":1.35,"headingStyle":"plain"},"shape":{"cardRadius":12,"imageRadius":10,"buttonRadius":12,"borderWidth":1},"layout":{"contentWidth":1180,"articleWidth":740,"sectionGap":1.25,"density":"relaxed","homeLayout":"editorial","journalLayout":"single"},"card":{"style":"glass","opacity":0.86,"blur":8},"background":{"style":"gradient","texture":"none","intensity":0.25},"image":{"style":"rounded","shadow":"soft","defaultRatio":"16:9","frame":"line","tone":"none","width":"medium","maxHeight":75},"gallery":{"layout":"grid","columns":3,"gap":12},"motion":{"level":"subtle","hover":"lift","entrance":true,"scrollReveal":true},"effects":{"particles":"snow","grain":false,"lightLeak":false,"vignette":false},"map":{"style":"dark","routeColor":"#A9C8DC","routeWidth":3,"markerStyle":"ring","animateRoute":true},"hero":{}}'::jsonb,
     true, true, 1)
on conflict (theme_key) do nothing;

-- ── 复古升级为「旧旅行时代」 ──────────────────────────────────────
-- 原来的复古只是奶油底 + 砖红 + serif，和秋日远行撞得厉害。两者必须分开：
-- 秋是自然与季节感，复古是年代感——邮戳、车票、老地图。所以复古这边加重
-- 颗粒与暗角，图片走冲洗照片的白边，地图固定 vintage 瓦片。
update theme_preset set
    name = '复古',
    description = '旧纸、邮戳与老地图，像上个年代的旅行相册。',
    definition_json = '{"colors":{"background":"#EFE6D2","surface":"#FBF4E4","surfaceSoft":"#E2D5BB","primary":"#4C3524","primarySoft":"#6F5238","secondary":"#B8873C","accent":"#A8402F","accentHover":"#8C3223","sand":"#D6BC8E","text":"#3B2C1E","muted":"#87755C","border":"#C4AC83","danger":"#96352A","scheme":"light"},"typography":{"headingFamily":"serif","bodyFamily":"serif","bodySize":17,"lineHeight":1.75,"letterSpacing":0.04,"headingWeight":800,"paragraphSpacing":1.2,"headingStyle":"serif-caps"},"shape":{"cardRadius":0,"imageRadius":0,"buttonRadius":0,"borderWidth":3},"layout":{"contentWidth":1120,"articleWidth":700,"sectionGap":1.05,"density":"compact","homeLayout":"classic","journalLayout":"single"},"card":{"style":"paper","opacity":1,"blur":0},"background":{"style":"solid","texture":"grain","intensity":0.45},"image":{"style":"paper","shadow":"soft","defaultRatio":"4:3","frame":"paper","tone":"vintage","width":"medium","maxHeight":70},"gallery":{"layout":"grid","columns":2,"gap":14},"motion":{"level":"subtle","hover":"tilt","entrance":true,"scrollReveal":false},"effects":{"particles":"dust","grain":true,"lightLeak":false,"vignette":true},"map":{"style":"vintage","routeColor":"#A8402F","routeWidth":4,"markerStyle":"dot","animateRoute":false},"hero":{}}'::jsonb,
    version = version + 1,
    updated_at = now()
 where theme_key = 'preset-retro';

-- ── 下线其余系统预设 ────────────────────────────────────────────
-- 分两步走，不能一律 delete：主题可能正被全站、某次旅行或某篇日记引用，
-- 直接删会让那些页面失去视觉。
--   仍被引用的 → 降级成个人主题，作者可以继续用、也可以自己删掉
--   没人引用的 → 直接移除
update theme_preset p set
    builtin = false,
    description = coalesce(p.description, '') || '（原系统预设，现已转为个人主题）',
    updated_at = now()
 where p.theme_key in ('preset-minimal', 'preset-japandi', 'preset-film', 'preset-scrapbook',
                       'preset-magazine', 'preset-midnight', 'preset-nature', 'preset-glass')
   and (exists (select 1 from admin_user u where u.theme_key = p.theme_key)
     or exists (select 1 from trip t where t.theme_key = p.theme_key)
     or exists (select 1 from journal_entry j where j.theme_key = p.theme_key));

delete from theme_preset p
 where p.theme_key in ('preset-minimal', 'preset-japandi', 'preset-film', 'preset-scrapbook',
                       'preset-magazine', 'preset-midnight', 'preset-nature', 'preset-glass')
   and p.builtin = true;
