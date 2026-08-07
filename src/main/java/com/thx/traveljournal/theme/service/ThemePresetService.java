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
    /**
     * 允许的基础视觉。曾经还有 sanya-breeze，但它相对 travel-classic 只多提供了一张首页封面图，
     * 而封面图已经改成每套主题自己上传，于是在 V6 迁移里下线了。
     */
    private static final Set<String> BASE_THEMES = Set.of(DEFAULT_THEME);
    private static final Pattern HEX_COLOR = Pattern.compile("^#[0-9a-fA-F]{6}$");
    private static final int MAX_DEFINITION_LENGTH = 20_000;

    /** token 的取值类型，决定 {@link #normalizeDefinition} 用哪套校验。 */
    private enum Kind { COLOR, NUMBER, ENUM, BOOLEAN, MEDIA }

    /**
     * 一个可调项的声明。
     *
     * <p>前端约定：{@code COLOR} 映射成 CSS 变量，{@code NUMBER} 映射成
     * {@code --tj-<section>-<key>}（短横线命名），{@code ENUM} 和 {@code BOOLEAN}
     * 映射成 {@code <html>} 上的 {@code data-<section>-<key>} 属性，CSS 用属性选择器接住。
     * 见 static/js/common/theme.js。</p>
     */
    private record Token(String section, String key, Kind kind, Set<String> allowed,
                         double min, double max, Object fallback) {
        static Token color(String section, String key) {
            return new Token(section, key, Kind.COLOR, Set.of(), 0, 0, null);
        }
        static Token number(String section, String key, double min, double max, double fallback) {
            return new Token(section, key, Kind.NUMBER, Set.of(), min, max, fallback);
        }
        static Token option(String section, String key, String fallback, String... allowed) {
            return new Token(section, key, Kind.ENUM, Set.of(allowed), 0, 0, fallback);
        }
        static Token flag(String section, String key, boolean fallback) {
            return new Token(section, key, Kind.BOOLEAN, Set.of(), 0, 0, fallback);
        }
        static Token media(String section, String key) {
            return new Token(section, key, Kind.MEDIA, Set.of(), 0, 0, null);
        }
        double fallbackNumber() { return (double) fallback; }
        String fallbackText() { return (String) fallback; }
        boolean fallbackBoolean() { return (boolean) fallback; }
    }

    /**
     * 主题可调项全表，也是整套主题系统的唯一真相来源。
     *
     * <p>新增一个可调项只需要在这里加一行，后端校验、默认值、前端控件列表和 CSS 变量名
     * 都会跟着走；对应的视觉表现写在 static/css/theme-tokens.css。</p>
     */
    private static final List<Token> SCHEMA = List.of(
            // —— 配色。留空表示沿用基础主题，所以没有默认值 ——
            Token.color("colors", "background"), Token.color("colors", "surface"),
            Token.color("colors", "surfaceSoft"), Token.color("colors", "primary"),
            Token.color("colors", "primarySoft"), Token.color("colors", "secondary"),
            Token.color("colors", "accent"), Token.color("colors", "accentHover"),
            Token.color("colors", "sand"), Token.color("colors", "text"),
            Token.color("colors", "muted"), Token.color("colors", "border"),
            Token.color("colors", "danger"), Token.color("colors", "gradientFrom"),
            Token.color("colors", "gradientTo"),
            // 明暗基调。影响阴影强度、地图瓦片和图片压暗策略，不只是换颜色
            Token.option("colors", "scheme", "light", "light", "dark"),

            // —— 字体与排版 ——
            Token.option("typography", "headingFamily", "serif", "serif", "sans", "rounded", "mono"),
            Token.option("typography", "bodyFamily", "sans", "serif", "sans", "rounded", "mono"),
            Token.number("typography", "bodySize", 14, 22, 16),
            Token.number("typography", "lineHeight", 1.4, 2.4, 1.8),
            Token.number("typography", "letterSpacing", -0.02, 0.24, 0),
            Token.number("typography", "headingWeight", 400, 900, 700),
            Token.number("typography", "paragraphSpacing", 0.6, 2.4, 1.2),
            Token.option("typography", "headingStyle", "plain", "plain", "underline", "bar", "serif-caps", "outline"),

            // —— 形状 ——
            Token.number("shape", "cardRadius", 0, 32, 12),
            Token.number("shape", "imageRadius", 0, 32, 8),
            Token.number("shape", "buttonRadius", 0, 32, 8),
            Token.number("shape", "borderWidth", 0, 4, 1),

            // —— 页面布局 ——
            Token.number("layout", "contentWidth", 960, 1600, 1200),
            Token.number("layout", "articleWidth", 600, 1000, 760),
            Token.number("layout", "sectionGap", 0.6, 2.2, 1),
            Token.option("layout", "density", "comfortable", "compact", "comfortable", "relaxed"),
            Token.option("layout", "homeLayout", "editorial", "classic", "editorial", "bento", "magazine", "timeline", "masonry"),
            Token.option("layout", "journalLayout", "single", "single", "wide", "immersive", "scrapbook"),

            // —— 卡片风格 ——
            Token.option("card", "style", "border", "flat", "border", "shadow", "glass", "paper", "polaroid", "film"),
            Token.number("card", "opacity", 0.4, 1, 1),
            Token.number("card", "blur", 0, 24, 0),

            // —— 页面背景 ——
            Token.option("background", "style", "solid", "solid", "gradient", "image"),
            Token.option("background", "texture", "none", "none", "paper", "grain", "noise", "dots", "grid", "topo"),
            Token.number("background", "intensity", 0, 1, 0.4),
            Token.media("background", "mediaId"),

            // —— 图片默认版式。日记里逐张选过的会覆盖这里，没选过的跟主题走 ——
            Token.option("image", "style", "natural", "natural", "rounded", "paper"),
            Token.option("image", "shadow", "soft", "none", "soft", "floating"),
            Token.option("image", "defaultRatio", "16:9", "natural", "16:9", "4:3", "1:1", "3:4"),
            Token.option("image", "frame", "none", "none", "line", "paper", "float", "polaroid", "tape", "film", "postcard"),
            Token.option("image", "tone", "none", "none", "warm", "vintage", "mono"),
            Token.option("image", "width", "medium", "small", "medium", "large", "full"),
            Token.number("image", "maxHeight", 30, 100, 75),

            // —— 多图布局 ——
            Token.option("gallery", "layout", "grid", "row", "grid", "masonry", "mosaic", "magazine", "carousel", "filmstrip"),
            Token.number("gallery", "columns", 2, 4, 3),
            Token.number("gallery", "gap", 0, 32, 10),

            // —— 动效 ——
            Token.option("motion", "level", "subtle", "none", "subtle", "standard", "strong"),
            Token.option("motion", "hover", "lift", "none", "lift", "zoom", "tilt"),
            Token.flag("motion", "entrance", true),
            Token.flag("motion", "scrollReveal", false),

            // —— 页面特效。默认全关，由用户自己开 ——
            Token.option("effects", "particles", "none", "none", "snow", "sakura", "leaves", "stars", "dust"),
            Token.flag("effects", "grain", false),
            Token.flag("effects", "lightLeak", false),
            Token.flag("effects", "vignette", false),

            // —— 地图 ——
            Token.option("map", "style", "auto", "auto", "light", "dark", "vintage", "terrain"),
            Token.color("map", "routeColor"),
            Token.number("map", "routeWidth", 1, 8, 3),
            Token.option("map", "markerStyle", "dot", "dot", "pin", "ring", "photo"),
            Token.flag("map", "animateRoute", false),

            // —— 首页封面图 ——
            Token.media("hero", "mediaId"));

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
     * 归一化主题配置：只保留 {@link #SCHEMA} 里声明过的 token，值越界就夹回区间，
     * 枚举不认识就换成默认值。
     *
     * <p>这些值最终会变成页面上的 CSS 变量和 {@code data-*} 属性，等于把配置直接注入样式表，
     * 所以必须逐项过滤。颜色只认 #RRGGBB，图片只认 media id 而不是任意 URL，
     * 免得有人往 {@code url()} 里塞东西。</p>
     *
     * <p>整表驱动而不是一行行手写，是为了让新增一个可调项只需要在 SCHEMA 里加一行；
     * 前端 theme.js 按同样的命名约定把 token 映射成 CSS 变量，不需要跟着改。</p>
     */
    private JsonNode normalizeDefinition(JsonNode source) {
        if (source == null || !source.isObject()) throw BusinessException.badRequest("主题配置必须是 JSON 对象");
        if (source.toString().length() > MAX_DEFINITION_LENGTH) throw BusinessException.badRequest("主题配置过大");
        ObjectNode result = objectMapper.createObjectNode();
        for (Token token : SCHEMA) {
            ObjectNode section = result.has(token.section())
                    ? (ObjectNode) result.get(token.section()) : result.putObject(token.section());
            JsonNode raw = source.path(token.section()).path(token.key());
            switch (token.kind()) {
                // 颜色留空表示「沿用基础主题」，所以不填默认值，只校验填了的
                case COLOR -> {
                    String value = raw.asText("");
                    if (StringUtils.hasText(value)) {
                        if (!HEX_COLOR.matcher(value).matches())
                            throw BusinessException.badRequest("颜色必须使用 #RRGGBB 格式：" + token.section() + "." + token.key());
                        section.put(token.key(), value.toUpperCase());
                    }
                }
                case NUMBER -> {
                    double value = raw.isNumber() ? raw.asDouble() : token.fallbackNumber();
                    section.put(token.key(), Math.max(token.min(), Math.min(token.max(), value)));
                }
                case ENUM -> {
                    String value = raw.asText(token.fallbackText());
                    section.put(token.key(), token.allowed().contains(value) ? value : token.fallbackText());
                }
                case BOOLEAN -> section.put(token.key(), raw.isBoolean() ? raw.asBoolean() : token.fallbackBoolean());
                // 图片一律只存 media id，展示地址由前端拼，配置里不出现 URL
                case MEDIA -> {
                    if (raw.isIntegralNumber() && raw.asLong() > 0) section.put(token.key(), raw.asLong());
                }
            }
        }
        return result;
    }

    /** 取主题配置里的首页封面图 id，没有设置时返回 null。 */
    public static Long heroMediaId(JsonNode definitionJson) {
        if (definitionJson == null) return null;
        JsonNode value = definitionJson.path("hero").path("mediaId");
        return value.isIntegralNumber() && value.asLong() > 0 ? value.asLong() : null;
    }

    private ThemeView view(ThemePreset preset) {
        return new ThemeView(preset.getId(), preset.getThemeKey(), preset.getName(), preset.getDescription(),
                preset.getBaseThemeKey(), preset.getPreviewImageUrl(), preset.getDefinitionJson(),
                Boolean.TRUE.equals(preset.getBuiltin()), Boolean.TRUE.equals(preset.getEnabled()),
                preset.getVersion() == null ? 1 : preset.getVersion());
    }
}
