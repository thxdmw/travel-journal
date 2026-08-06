package com.thx.traveljournal.theme.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.thx.traveljournal.auth.entity.AdminUser;
import com.thx.traveljournal.auth.mapper.AdminUserMapper;
import com.thx.traveljournal.common.exception.BusinessException;
import com.thx.traveljournal.journal.entity.JournalEntry;
import com.thx.traveljournal.journal.mapper.JournalMapper;
import com.thx.traveljournal.theme.entity.ThemePreset;
import com.thx.traveljournal.theme.mapper.ThemePresetMapper;
import com.thx.traveljournal.trip.entity.Trip;
import com.thx.traveljournal.trip.mapper.TripMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
/**
 * 主题服务：主题预设的增删改查，以及「当前该用哪个主题」的计算。
 *
 * <p>主题分三层，优先级从高到低是日记专属、旅行专属、全站默认，见 {@link #effective}。
 * 保存前所有配置都会过一遍 {@link #normalizeDefinition} 白名单过滤，
 * 因为这些值最终会变成页面上的 CSS 变量。</p>
 */
public class ThemePresetService {
    /** 兜底主题，任何环节找不到有效主题时都回落到它 */
    public static final String DEFAULT_THEME = "travel-classic";
    private static final Set<String> BASE_THEMES = Set.of(DEFAULT_THEME, "sanya-breeze");
    private static final Set<String> COLOR_KEYS = Set.of("background", "surface", "surfaceSoft", "primary",
            "primarySoft", "accent", "accentHover", "sand", "text", "muted", "border", "danger");
    private static final Pattern HEX_COLOR = Pattern.compile("^#[0-9a-fA-F]{6}$");

    private final ThemePresetMapper mapper;
    private final AdminUserMapper adminUserMapper;
    private final TripMapper tripMapper;
    private final JournalMapper journalMapper;
    private final ObjectMapper objectMapper;

    public record ThemeView(Long id, String themeKey, String name, String description,
                            String baseThemeKey, String previewImageUrl, JsonNode definitionJson,
                            boolean builtin, boolean enabled, int version) {}

    public List<ThemeView> list(boolean enabledOnly) {
        LambdaQueryWrapper<ThemePreset> query = new LambdaQueryWrapper<ThemePreset>()
                .eq(enabledOnly, ThemePreset::getEnabled, true)
                .orderByDesc(ThemePreset::getBuiltin).orderByDesc(ThemePreset::getUpdatedAt);
        return mapper.selectList(query).stream().map(this::view).toList();
    }

    public ThemePreset get(Long id) {
        ThemePreset preset = mapper.selectById(id);
        if (preset == null) throw BusinessException.notFound("主题不存在");
        return preset;
    }

    /** 按标识取主题，取不到或已停用时回落到全站主题。 */
    public ThemeView resolve(String themeKey) {
        ThemePreset preset = findEnabled(themeKey);
        if (preset == null) preset = findEnabled(DEFAULT_THEME);
        if (preset == null) throw BusinessException.notFound("默认主题不存在，请执行数据库迁移");
        return view(preset);
    }

    public ThemeView activeSiteTheme() {
        AdminUser user = adminUserMapper.selectOne(new LambdaQueryWrapper<AdminUser>()
                .eq(AdminUser::getEnabled, true).orderByAsc(AdminUser::getId).last("limit 1"));
        return resolve(user == null ? DEFAULT_THEME : user.getThemeKey());
    }

    /** 计算最终生效的主题，优先级：日记专属 &gt; 旅行专属 &gt; 全站主题。 */
    public ThemeView effective(String journalThemeKey, String tripThemeKey) {
        if (StringUtils.hasText(journalThemeKey)) return resolve(journalThemeKey);
        if (StringUtils.hasText(tripThemeKey)) return resolve(tripThemeKey);
        return activeSiteTheme();
    }

    /** 校验前端选的主题是否存在且启用；传空表示继承上层主题，直接返回 null。 */
    public String validateSelection(String themeKey) {
        if (!StringUtils.hasText(themeKey)) return null;
        if (findEnabled(themeKey.trim()) == null) throw BusinessException.badRequest("所选主题不存在或已停用");
        return themeKey.trim();
    }

    @Transactional
    public ThemeView create(String name, String description, String baseThemeKey,
                            String previewImageUrl, JsonNode definitionJson, Boolean enabled) {
        ThemePreset preset = new ThemePreset();
        preset.setThemeKey("custom-" + UUID.randomUUID().toString().replace("-", "").substring(0, 12));
        apply(preset, name, description, baseThemeKey, previewImageUrl, definitionJson, enabled);
        preset.setBuiltin(false);
        preset.setVersion(1);
        mapper.insert(preset);
        return view(preset);
    }

    @Transactional
    public ThemeView update(Long id, String name, String description, String baseThemeKey,
                            String previewImageUrl, JsonNode definitionJson, Boolean enabled) {
        ThemePreset preset = get(id);
        if (Boolean.TRUE.equals(preset.getBuiltin())) throw BusinessException.badRequest("系统主题请先复制后再修改");
        apply(preset, name, description, baseThemeKey, previewImageUrl, definitionJson, enabled);
        preset.setVersion((preset.getVersion() == null ? 1 : preset.getVersion()) + 1);
        mapper.updateById(preset);
        return view(preset);
    }

    @Transactional
    public ThemeView duplicate(Long id) {
        ThemePreset source = get(id);
        return create(source.getName() + " · 副本", source.getDescription(), source.getBaseThemeKey(),
                source.getPreviewImageUrl(), source.getDefinitionJson(), true);
    }

    @Transactional
    /** 删除个人主题。系统预设不能删；仍被全站、旅行或日记引用的主题也不能删。 */
    public void delete(Long id) {
        ThemePreset preset = get(id);
        if (Boolean.TRUE.equals(preset.getBuiltin())) throw BusinessException.badRequest("系统主题不能删除");
        String key = preset.getThemeKey();
        long references = adminUserMapper.selectCount(new LambdaQueryWrapper<AdminUser>().eq(AdminUser::getThemeKey, key))
                + tripMapper.selectCount(new LambdaQueryWrapper<Trip>().eq(Trip::getThemeKey, key))
                + journalMapper.selectCount(new LambdaQueryWrapper<JournalEntry>().eq(JournalEntry::getThemeKey, key));
        if (references > 0) throw BusinessException.badRequest("该主题正在使用，请先切换关联页面的主题");
        mapper.deleteById(id);
    }

    private ThemePreset findEnabled(String themeKey) {
        if (!StringUtils.hasText(themeKey)) return null;
        return mapper.selectOne(new LambdaQueryWrapper<ThemePreset>()
                .eq(ThemePreset::getThemeKey, themeKey).eq(ThemePreset::getEnabled, true));
    }

    private void apply(ThemePreset preset, String name, String description, String baseThemeKey,
                       String previewImageUrl, JsonNode definitionJson, Boolean enabled) {
        if (!StringUtils.hasText(name) || name.trim().length() > 100) throw BusinessException.badRequest("主题名称不能为空且不能超过 100 字");
        if (description != null && description.length() > 500) throw BusinessException.badRequest("主题说明不能超过 500 字");
        String base = StringUtils.hasText(baseThemeKey) ? baseThemeKey.trim() : DEFAULT_THEME;
        if (!BASE_THEMES.contains(base)) throw BusinessException.badRequest("基础主题不支持");
        if (previewImageUrl != null && previewImageUrl.length() > 500) throw BusinessException.badRequest("预览图片地址过长");
        preset.setName(name.trim());
        preset.setDescription(description == null ? null : description.trim());
        preset.setBaseThemeKey(base);
        preset.setPreviewImageUrl(StringUtils.hasText(previewImageUrl) ? previewImageUrl.trim() : null);
        preset.setDefinitionJson(normalizeDefinition(definitionJson));
        preset.setEnabled(enabled == null || enabled);
    }

    /**
     * 归一化主题配置：只保留白名单内的键，值超出范围就换成默认值。
     *
     * <p>主题配置最终会变成页面上的 CSS 变量，所以必须逐项过滤——
     * 颜色只认 #RRGGBB，枚举只认预设值，数值限定在合理区间，
     * 免得有人塞进任意字符串把样式表撑坏。</p>
     */
    private JsonNode normalizeDefinition(JsonNode source) {
        if (source == null || !source.isObject()) throw BusinessException.badRequest("主题配置必须是 JSON 对象");
        if (source.toString().length() > 20_000) throw BusinessException.badRequest("主题配置过大");
        ObjectNode result = objectMapper.createObjectNode();
        ObjectNode colors = result.putObject("colors");
        JsonNode sourceColors = source.path("colors");
        for (String key : COLOR_KEYS) {
            String value = sourceColors.path(key).asText("");
            if (StringUtils.hasText(value)) {
                if (!HEX_COLOR.matcher(value).matches()) throw BusinessException.badRequest("颜色必须使用 #RRGGBB 格式");
                colors.put(key, value.toUpperCase());
            }
        }
        ObjectNode typography = result.putObject("typography");
        putEnum(typography, source.path("typography"), "headingFamily", Set.of("serif", "sans"), "serif");
        putEnum(typography, source.path("typography"), "bodyFamily", Set.of("serif", "sans"), "sans");
        putNumber(typography, source.path("typography"), "bodySize", 14, 22, 16);
        putNumber(typography, source.path("typography"), "lineHeight", 1.4, 2.2, 1.8);
        ObjectNode shape = result.putObject("shape");
        putNumber(shape, source.path("shape"), "cardRadius", 0, 32, 12);
        putNumber(shape, source.path("shape"), "imageRadius", 0, 32, 8);
        putNumber(shape, source.path("shape"), "buttonRadius", 0, 32, 8);
        ObjectNode layout = result.putObject("layout");
        putNumber(layout, source.path("layout"), "contentWidth", 960, 1600, 1200);
        putNumber(layout, source.path("layout"), "articleWidth", 600, 1000, 760);
        putEnum(layout, source.path("layout"), "density", Set.of("compact", "comfortable", "relaxed"), "comfortable");
        putEnum(layout, source.path("layout"), "homeLayout", Set.of("classic", "editorial"), "editorial");
        ObjectNode image = result.putObject("image");
        putEnum(image, source.path("image"), "style", Set.of("natural", "rounded", "paper"), "natural");
        putEnum(image, source.path("image"), "shadow", Set.of("none", "soft", "floating"), "soft");
        putEnum(image, source.path("image"), "defaultRatio", Set.of("natural", "16:9", "4:3", "1:1"), "16:9");
        ObjectNode motion = result.putObject("motion");
        putEnum(motion, source.path("motion"), "level", Set.of("none", "subtle"), "subtle");
        return result;
    }

    private void putEnum(ObjectNode target, JsonNode source, String key, Set<String> allowed, String fallback) {
        String value = source.path(key).asText(fallback);
        target.put(key, allowed.contains(value) ? value : fallback);
    }

    private void putNumber(ObjectNode target, JsonNode source, String key, double min, double max, double fallback) {
        double value = source.path(key).isNumber() ? source.path(key).asDouble() : fallback;
        target.put(key, Math.max(min, Math.min(max, value)));
    }

    private ThemeView view(ThemePreset preset) {
        return new ThemeView(preset.getId(), preset.getThemeKey(), preset.getName(), preset.getDescription(),
                preset.getBaseThemeKey(), preset.getPreviewImageUrl(), preset.getDefinitionJson(),
                Boolean.TRUE.equals(preset.getBuiltin()), Boolean.TRUE.equals(preset.getEnabled()),
                preset.getVersion() == null ? 1 : preset.getVersion());
    }
}
