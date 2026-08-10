-- Theme Pack V2：给六套系统主题补上「性格」那几层。
--
-- V12 让主题收敛成了六套，但每套仍然只是配色 + 排版参数。这一步补的是
-- decorations / stickers / dividers / ambient / blockStyles / interactions ——
-- 装饰、贴纸、分隔线、氛围、Block 皮肤和几个可交互的小动作。
-- 有了它们，从夏切到秋才会是「海浪和太阳换成落叶和车票」，而不只是蓝色变成橙色。
--
-- 用 jsonb 合并（||）而不是整体替换：上面那些配色和排版是 V12 刚调好的，
-- 这里只往里加新区块，不动已有的键。
--
-- 三条约束和后端 ThemePresetService.SCHEMA 是一致的，写在这里是为了让人看 SQL 就明白：
--   1. 贴纸位置只能用白名单里的那几个（hero-right、section-gap 之类），不写像素坐标
--   2. 贴纸素材名只能是小写字母、数字和短横线，最终拼成 /assets/themes/stickers/{asset}.svg
--   3. interactions 只收枚举，永远不收 JavaScript

-- 远行经典：品牌视觉。指南针、地图针、行李牌，克制到可以长期看。
update theme_preset set
    definition_json = definition_json || '{
      "decorations":{"corner":"compass","pageEdge":"none","headerOrnament":"line","opacity":0.28},
      "stickers":{"density":"low","items":[
        {"asset":"classic-compass","area":"hero-right"},
        {"asset":"classic-pin","area":"section-gap"}]},
      "dividers":{"style":"ornament","glyph":"compass"},
      "ambient":{"glow":"none","drift":"none","intensity":0.3},
      "blockStyles":{"callout":"plain","quote":"mark","timeline":"line","stats":"plain","locationCard":"label"},
      "interactions":{"stickerClick":"pop","imageHover":"lift","heroEntrance":"fade"}
    }'::jsonb
      || jsonb_build_object('hero', coalesce(definition_json->'hero', '{}'::jsonb) || '{"shape":"none","overlay":"none"}'::jsonb),
    version = version + 1, updated_at = now()
 where theme_key = 'travel-classic';

-- 春：淡樱花枝线稿，偶尔飘几片花瓣。点一下樱花会散开。
update theme_preset set
    definition_json = definition_json || '{
      "decorations":{"corner":"vine","pageEdge":"petal","headerOrnament":"arch","opacity":0.3},
      "stickers":{"density":"low","items":[
        {"asset":"spring-sakura","area":"hero-right"},
        {"asset":"spring-bird","area":"hero-left"},
        {"asset":"spring-sprout","area":"section-gap"},
        {"asset":"spring-cloud","area":"page-right"}]},
      "dividers":{"style":"ornament","glyph":"sakura"},
      "ambient":{"glow":"dawn","drift":"clouds","intensity":0.32},
      "blockStyles":{"callout":"paper","quote":"handwritten","timeline":"dots","stats":"badge","locationCard":"label"},
      "interactions":{"stickerClick":"drift","imageHover":"lift","heroEntrance":"float"}
    }'::jsonb
      || jsonb_build_object('hero', coalesce(definition_json->'hero', '{}'::jsonb) || '{"shape":"arch","overlay":"none"}'::jsonb),
    version = version + 1, updated_at = now()
 where theme_key = 'preset-spring';

-- 夏：阳光光斑、极慢的云、波浪底边。整体是通透和空气感。
update theme_preset set
    definition_json = definition_json || '{
      "decorations":{"corner":"wave","pageEdge":"sun","headerOrnament":"wave","opacity":0.34},
      "stickers":{"density":"medium","items":[
        {"asset":"summer-sun","area":"hero-right"},
        {"asset":"summer-wave","area":"section-gap"},
        {"asset":"summer-drink","area":"page-right"},
        {"asset":"summer-watermelon","area":"footer"}]},
      "dividers":{"style":"wave","glyph":"sun"},
      "ambient":{"glow":"sun","drift":"clouds","intensity":0.45},
      "blockStyles":{"callout":"plain","quote":"card","timeline":"dots","stats":"badge","locationCard":"label"},
      "interactions":{"stickerClick":"wiggle","imageHover":"zoom","heroEntrance":"drift"}
    }'::jsonb
      || jsonb_build_object('hero', coalesce(definition_json->'hero', '{}'::jsonb) || '{"shape":"wave","overlay":"sun"}'::jsonb),
    version = version + 1, updated_at = now()
 where theme_key = 'preset-summer';

-- 秋：旧纸、车票、咖啡。质感最重的一套，和复古的区别在于它是自然与季节，不是年代。
update theme_preset set
    definition_json = definition_json || '{
      "decorations":{"corner":"leaf","pageEdge":"leaf","headerOrnament":"ticket","opacity":0.38},
      "stickers":{"density":"low","items":[
        {"asset":"autumn-maple","area":"hero-right"},
        {"asset":"autumn-coffee","area":"page-right"},
        {"asset":"autumn-ticket","area":"section-gap"},
        {"asset":"autumn-leaf","area":"footer"}]},
      "dividers":{"style":"torn","glyph":"leaf"},
      "ambient":{"glow":"lantern","drift":"mist","intensity":0.35},
      "blockStyles":{"callout":"tape","quote":"handwritten","timeline":"tickets","stats":"ticket","locationCard":"postcard"},
      "interactions":{"stickerClick":"drift","imageHover":"tilt","heroEntrance":"fade"}
    }'::jsonb
      || jsonb_build_object('hero', coalesce(definition_json->'hero', '{}'::jsonb) || '{"shape":"torn","overlay":"paper"}'::jsonb),
    version = version + 1, updated_at = now()
 where theme_key = 'preset-autumn';

-- 冬：冷环境 + 暖灯光。霜花线稿配月光，咖啡杯是那一点暖橙。
update theme_preset set
    definition_json = definition_json || '{
      "decorations":{"corner":"frost","pageEdge":"snow","headerOrnament":"line","opacity":0.32},
      "stickers":{"density":"low","items":[
        {"asset":"winter-snowflake","area":"hero-right"},
        {"asset":"winter-mug","area":"page-right"},
        {"asset":"winter-pine","area":"section-gap"},
        {"asset":"winter-cabin","area":"footer"}]},
      "dividers":{"style":"dotted","glyph":"snow"},
      "ambient":{"glow":"moon","drift":"mist","intensity":0.4},
      "blockStyles":{"callout":"frame","quote":"card","timeline":"dots","stats":"badge","locationCard":"label"},
      "interactions":{"stickerClick":"pop","imageHover":"lift","heroEntrance":"float"}
    }'::jsonb
      || jsonb_build_object('hero', coalesce(definition_json->'hero', '{}'::jsonb) || '{"shape":"none","overlay":"frost"}'::jsonb),
    version = version + 1, updated_at = now()
 where theme_key = 'preset-winter';

-- 复古：旧旅行时代。邮戳、护照印章、登机牌，年代感而不是季节感。
update theme_preset set
    definition_json = definition_json || '{
      "decorations":{"corner":"stamp","pageEdge":"none","headerOrnament":"ticket","opacity":0.4},
      "stickers":{"density":"low","items":[
        {"asset":"retro-stamp","area":"hero-right"},
        {"asset":"retro-postmark","area":"page-right"},
        {"asset":"retro-plane","area":"section-gap"},
        {"asset":"retro-passport","area":"footer"}]},
      "dividers":{"style":"dashed","glyph":"plane"},
      "ambient":{"glow":"none","drift":"none","intensity":0.25},
      "blockStyles":{"callout":"ticket","quote":"mark","timeline":"stamps","stats":"ticket","locationCard":"passport"},
      "interactions":{"stickerClick":"wiggle","imageHover":"stamp","heroEntrance":"fade"}
    }'::jsonb
      || jsonb_build_object('hero', coalesce(definition_json->'hero', '{}'::jsonb) || '{"shape":"tape","overlay":"paper"}'::jsonb),
    version = version + 1, updated_at = now()
 where theme_key = 'preset-retro';
