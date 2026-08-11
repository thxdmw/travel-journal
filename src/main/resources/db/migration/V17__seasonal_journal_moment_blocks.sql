-- 让今日开场、章节节点和今日小结真正成为主题语言的一部分。
-- 这个枚举进入 Theme Pack 的 blockStyles，复制系统主题后也会完整继承，
-- CSS 不需要依赖固定 theme_key。

update theme_preset set
    definition_json = jsonb_set(definition_json, '{blockStyles,journalMoment}', '"classic"', true),
    version = version + 1, updated_at = now()
where theme_key = 'travel-classic';

update theme_preset set
    definition_json = jsonb_set(definition_json, '{blockStyles,journalMoment}', '"spring"', true),
    version = version + 1, updated_at = now()
where theme_key = 'preset-spring';

update theme_preset set
    definition_json = jsonb_set(definition_json, '{blockStyles,journalMoment}', '"summer"', true),
    version = version + 1, updated_at = now()
where theme_key = 'preset-summer';

update theme_preset set
    definition_json = jsonb_set(definition_json, '{blockStyles,journalMoment}', '"autumn"', true),
    version = version + 1, updated_at = now()
where theme_key = 'preset-autumn';

update theme_preset set
    definition_json = jsonb_set(definition_json, '{blockStyles,journalMoment}', '"winter"', true),
    version = version + 1, updated_at = now()
where theme_key = 'preset-winter';

update theme_preset set
    definition_json = jsonb_set(definition_json, '{blockStyles,journalMoment}', '"retro"', true),
    version = version + 1, updated_at = now()
where theme_key = 'preset-retro';

