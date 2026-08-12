package com.thx.traveljournal.theme.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
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

import java.util.Iterator;
import java.util.List;
import java.util.Map;
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
    /** Theme Pack V2 的区块比原来多了一倍，上限跟着放宽一点，仍然远小于任何正常主题的体积。 */
    private static final int MAX_DEFINITION_LENGTH = 30_000;

    /** token 的取值类型，决定 {@link #normalizeDefinition} 用哪套校验。 */
    private enum Kind { COLOR, NUMBER, ENUM, BOOLEAN, MEDIA, STICKERS }

    /**
     * 贴纸可以落在页面的哪些位置。
     *
     * <p>刻意做成一份很短的白名单，而不是让主题自己写 {@code left:1782px; top:553px}——
     * 绝对坐标在手机上一定会错位，而且每加一个断点就要重新调一遍所有主题。
     * 具体每个位置贴在哪，由 CSS 决定，主题只说「放在页眉右边」这种意图。</p>
     */
    private static final Set<String> STICKER_AREAS = Set.of(
            "hero-left", "hero-right", "page-left", "page-right",
            "section-gap", "image-corner", "footer");
    /** 贴纸素材名，最终会拼成 /assets/themes/stickers/{asset}.svg，所以只认小写字母、数字和短横线。 */
    private static final Pattern STICKER_ASSET = Pattern.compile("^[a-z0-9]+(?:-[a-z0-9]+)*$");
    /** 一套主题最多铺多少张贴纸。再多页面就吵了，克制是这套设计的一部分。 */
    private static final int MAX_STICKERS = 10;

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
        static Token stickers(String section, String key) {
            return new Token(section, key, Kind.STICKERS, Set.of(), 0, 0, null);
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

            // ——————————————————————————————————————————————————————————
            // Theme Pack V2：从这里开始，主题不只是「配色 + CSS 参数」。
            // 上面那些决定页面长什么样，下面这些决定页面有没有性格——
            // 装饰、贴纸、分隔线、氛围、Block 皮肤和可交互的小动作。
            // ——————————————————————————————————————————————————————————

            // —— 页面装饰。四角线稿、页边点缀、标题旁的纹样 ——
            Token.option("decorations", "corner", "none", "none", "vine", "wave", "leaf", "frost", "stamp", "compass"),
            Token.option("decorations", "pageEdge", "none", "none", "petal", "sun", "leaf", "snow", "star"),
            Token.option("decorations", "headerOrnament", "none", "none", "line", "compass", "ticket", "arch", "wave"),
            Token.number("decorations", "opacity", 0.05, 1, 0.35),

            // —— 贴纸。位置走白名单，主题只说意图，具体贴在哪由 CSS 决定 ——
            Token.option("stickers", "density", "none", "none", "low", "medium"),
            Token.stickers("stickers", "items"),

            // —— 章节分隔线。glyph 也是枚举，前端映射成具体符号 ——
            Token.option("dividers", "style", "line", "line", "dashed", "dotted", "ornament", "wave", "torn"),
            Token.option("dividers", "glyph", "none", "none", "sakura", "sun", "leaf", "snow",
                    "compass", "plane", "stamp", "wave", "star"),

            // —— 环境氛围。比粒子更安静的一层，通常是极慢的移动或一片光 ——
            Token.option("ambient", "glow", "none", "none", "sun", "moon", "lantern", "dawn"),
            Token.option("ambient", "drift", "none", "none", "clouds", "mist", "fireflies"),
            Token.number("ambient", "intensity", 0, 1, 0.4),

            // —— Block 皮肤。同一个内容块在不同主题里长得不一样 ——
            Token.option("blockStyles", "callout", "plain", "plain", "paper", "tape", "ticket", "frame"),
            Token.option("blockStyles", "quote", "plain", "plain", "mark", "card", "handwritten"),
            Token.option("blockStyles", "timeline", "line", "line", "dots", "stamps", "tickets"),
            Token.option("blockStyles", "stats", "plain", "plain", "badge", "ticket"),
            Token.option("blockStyles", "locationCard", "plain", "plain", "postcard", "label", "passport"),
            Token.option("blockStyles", "journalMoment", "classic", "classic", "spring", "summer",
                    "autumn", "winter", "retro"),

            /*
             * 互动。
             *
             * 只收枚举，绝不收 JavaScript 或 onclick 之类的字符串——主题配置是可以
             * 导入导出的 JSON，一旦允许里面出现代码，导入一份别人的主题就等于执行别人的脚本。
             * 每个值对应前端预先写好的一个行为，见 static/css/theme-pack.css 和 theme-effects.js。
             */
            Token.option("interactions", "stickerClick", "none", "none", "pop", "wiggle", "drift", "heart-pop"),
            Token.option("interactions", "imageHover", "none", "none", "tilt", "zoom", "lift", "stamp"),
            Token.option("interactions", "heroEntrance", "none", "none", "float", "fade", "drift"),

            // —— 首页封面图 ——
            Token.media("hero", "mediaId"),
            Token.option("hero", "shape", "none", "none", "wave", "arch", "torn", "tape"),
            Token.option("hero", "overlay", "none", "none", "sun", "frost", "paper", "dusk"));

    private final ThemePresetMapper mapper;
    private final AdminUserMapper adminUserMapper;
    private final TripMapper tripMapper;
    private final JournalMapper journalMapper;
    private final ObjectMapper objectMapper;
    private final SeasonService seasonService;

    /**
     * @param definitionJson         生效配置（官方值和用户覆盖 merge 之后），站点渲染和设计器编辑都用这份
     * @param officialDefinitionJson 官方原始配置，只有 builtin 才有意义，用于「查看修改」对照旧值
     * @param overrideJson           用户覆盖的稀疏 JSON，没有修改过时为 null
     * @param customizedCount        override 里的叶子字段数，即「已自定义 N 项」
     */
    public record ThemeView(Long id, String themeKey, String name, String description,
                            String baseThemeKey, String previewImageUrl, JsonNode definitionJson,
                            boolean builtin, boolean enabled, int version,
                            JsonNode officialDefinitionJson, JsonNode overrideJson, int customizedCount) {}

    /**
     * 全站主题的当前状态，供后台的主题选择器展示「跟随季节 · 夏 · 盛夏出逃」这样一行。
     *
     * @param mode      AUTO 或 FIXED
     * @param season    当前季节的中文名，FIXED 时也给出来，方便切回自动时预告会变成什么
     * @param theme     实际生效的主题
     */
    public record SiteThemeState(String mode, String season, String seasonThemeKey, ThemeView theme) {}

    /** 全站主题模式：跟随季节。 */
    public static final String MODE_AUTO = "AUTO";
    /** 全站主题模式：固定用作者选定的那一套。 */
    public static final String MODE_FIXED = "FIXED";

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

    /**
     * 当前生效的全站主题。
     *
     * <p>AUTO 模式下跟着站点所在地的季节走：8 月是盛夏出逃，到了 9 月自己变成秋日远行，
     * 作者什么都不用做。一旦作者手动选过某一套，模式就变成 FIXED，季节更替不再影响它，
     * 直到重新点「跟随季节」。</p>
     */
    public ThemeView activeSiteTheme() {
        return siteThemeState().theme();
    }

    /** 全站主题的完整状态，含模式和当前季节，供后台选择器展示。 */
    public SiteThemeState siteThemeState() {
        AdminUser user = adminUserMapper.selectOne(new LambdaQueryWrapper<AdminUser>()
                .eq(AdminUser::getEnabled, true).orderByAsc(AdminUser::getId).last("limit 1"));
        SeasonService.Season season = seasonService.current();
        boolean auto = user == null || !MODE_FIXED.equals(user.getThemeMode());
        String key = auto ? season.themeKey() : user.getThemeKey();
        return new SiteThemeState(auto ? MODE_AUTO : MODE_FIXED, season.label(), season.themeKey(), resolve(key));
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

    /**
     * 更新主题。系统主题和个人主题走两条不同的路：
     *
     * <p>个人主题和以前一样，提交的配置直接成为新的 definitionJson。系统主题不再拒绝编辑，
     * 但官方 definitionJson 永不写回——名称、说明、基础视觉、启用状态是官方身份的一部分，
     * 这个入口不改它们；视觉配置归一化后与官方值逐项 diff，只把真正不同的字段存进
     * overrideJson（稀疏），相同的字段不存。这样官方主题以后升级、definitionJson 里
     * 新增或调整了用户没碰过的字段时，effective 计算会自动带出新值。</p>
     */
    @Transactional
    public ThemeView update(Long id, String name, String description, String baseThemeKey,
                             String previewImageUrl, JsonNode definitionJson, Boolean enabled) {
        return update(id, name, description, baseThemeKey, previewImageUrl, definitionJson, enabled, null);
    }

    /**
     * {@code changedPaths} 是设计器相对打开时快照真正改动过的 token 路径。系统主题只把这些
     * 路径应用到当前 effective definition 后再做 sparse diff，避免前端为了渲染空控件补的
     * fallback 被误记成用户覆盖。旧客户端不传时仍兼容原来的完整配置更新方式。
     */
    @Transactional
    public ThemeView update(Long id, String name, String description, String baseThemeKey,
                            String previewImageUrl, JsonNode definitionJson, Boolean enabled,
                            List<String> changedPaths) {
        ThemePreset preset = get(id);
        if (Boolean.TRUE.equals(preset.getBuiltin())) {
            JsonNode normalized = normalizeDefinition(definitionJson);
            JsonNode candidate = normalized;
            if (changedPaths != null) {
                candidate = effectiveDefinition(preset).deepCopy();
                for (String path : changedPaths.stream().distinct().toList()) {
                    if (!isThemeTokenPath(path)) throw BusinessException.badRequest("未知的主题设置：" + path);
                    copyChangedPath((ObjectNode) candidate, preset.getDefinitionJson(), definitionJson, normalized, path);
                }
            }
            JsonNode diff = sparseDiff(candidate, preset.getDefinitionJson());
            preset.setOverrideJson(diff.size() == 0 ? null : diff);
        } else {
            apply(preset, name, description, baseThemeKey, previewImageUrl, definitionJson, enabled);
        }
        preset.setVersion((preset.getVersion() == null ? 1 : preset.getVersion()) + 1);
        mapper.updateById(preset);
        return view(preset);
    }

    private boolean isThemeTokenPath(String path) {
        if (!StringUtils.hasText(path)) return false;
        int dot = path.indexOf('.');
        if (dot <= 0 || dot != path.lastIndexOf('.')) return false;
        String section = path.substring(0, dot), key = path.substring(dot + 1);
        return SCHEMA.stream().anyMatch(token -> token.section().equals(section) && token.key().equals(key));
    }

    /** 把单个已校验 token 从提交值复制到 candidate；显式 null 用于清除官方 mediaId。 */
    private void copyChangedPath(ObjectNode candidate, JsonNode official, JsonNode raw, JsonNode normalized, String path) {
        String[] parts = path.split("\\.", 2);
        ObjectNode section = candidate.has(parts[0]) && candidate.get(parts[0]).isObject()
                ? (ObjectNode) candidate.get(parts[0]) : candidate.putObject(parts[0]);
        JsonNode rawValue = raw.path(parts[0]).get(parts[1]);
        JsonNode value = normalized.path(parts[0]).get(parts[1]);
        if (value != null) section.set(parts[1], value);
        else if (rawValue != null && rawValue.isNull()
                && official.path(parts[0]).has(parts[1])) section.putNull(parts[1]);
        else section.remove(parts[1]);
    }

    /** 还原系统主题的官方默认：清空 overrideJson，effective 自然回到官方 definitionJson。 */
    @Transactional
    public ThemeView resetOverride(Long id) {
        ThemePreset preset = get(id);
        if (!Boolean.TRUE.equals(preset.getBuiltin())) throw BusinessException.badRequest("只有系统主题支持还原默认");
        preset.setOverrideJson(null);
        preset.setVersion((preset.getVersion() == null ? 1 : preset.getVersion()) + 1);
        mapper.updateById(preset);
        return view(preset);
    }

    /** 复制主题：系统主题复制的是当前生效值（官方 + 用户覆盖 merge 之后），不是裸官方值。 */
    @Transactional
    public ThemeView duplicate(Long id) {
        ThemePreset source = get(id);
        return create(source.getName() + " · 副本", source.getDescription(), source.getBaseThemeKey(),
                source.getPreviewImageUrl(), effectiveDefinition(source), true);
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
                case STICKERS -> section.set(token.key(), normalizeStickers(raw));
            }
        }
        return result;
    }

    /**
     * 归一化贴纸列表。
     *
     * <p>每一项只有 asset 和 area 两个字段：素材名会被拼进 SVG 的路径，位置会变成
     * CSS 类名，两个都是能影响页面的值，所以都必须过白名单。不认识的项直接丢掉而不是报错——
     * 导入一份为新版本写的主题时，旧版本应该照常能用，只是少几张贴纸。</p>
     */
    private ArrayNode normalizeStickers(JsonNode raw) {
        ArrayNode result = objectMapper.createArrayNode();
        if (!raw.isArray()) return result;
        for (JsonNode item : raw) {
            if (result.size() >= MAX_STICKERS) break;
            String asset = item.path("asset").asText("").trim();
            String area = item.path("area").asText("").trim();
            if (!STICKER_ASSET.matcher(asset).matches() || asset.length() > 40) continue;
            if (!STICKER_AREAS.contains(area)) continue;
            ObjectNode sticker = result.addObject();
            sticker.put("asset", asset);
            sticker.put("area", area);
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
        boolean builtin = Boolean.TRUE.equals(preset.getBuiltin());
        JsonNode override = builtin ? preset.getOverrideJson() : null;
        return new ThemeView(preset.getId(), preset.getThemeKey(), preset.getName(), preset.getDescription(),
                preset.getBaseThemeKey(), preset.getPreviewImageUrl(), effectiveDefinition(preset),
                builtin, Boolean.TRUE.equals(preset.getEnabled()),
                preset.getVersion() == null ? 1 : preset.getVersion(),
                preset.getDefinitionJson(), override, countLeaves(override));
    }

    /** 生效配置 = 官方值 + 用户覆盖 merge；个人主题或没有覆盖的系统主题直接就是官方值本身。 */
    private JsonNode effectiveDefinition(ThemePreset preset) {
        if (!Boolean.TRUE.equals(preset.getBuiltin())) return preset.getDefinitionJson();
        JsonNode override = preset.getOverrideJson();
        if (override == null || override.isNull() || override.size() == 0) return preset.getDefinitionJson();
        return deepMerge(preset.getDefinitionJson(), override);
    }

    /**
     * 把 override 逐字段叠到 base 上：同名的对象字段递归合并，其余字段（含数组）
     * 由 override 整体覆盖。贴纸列表这类数组改一项就整份收进 override，
     * 逐条比较、逐条合并没有意义。
     */
    private JsonNode deepMerge(JsonNode base, JsonNode override) {
        if (override == null || override.isNull() || override.isMissingNode()) return base;
        if (base == null || !base.isObject() || !override.isObject()) return override;
        ObjectNode merged = base.deepCopy();
        Iterator<Map.Entry<String, JsonNode>> fields = override.fields();
        while (fields.hasNext()) {
            Map.Entry<String, JsonNode> entry = fields.next();
            JsonNode baseValue = merged.get(entry.getKey());
            JsonNode overrideValue = entry.getValue();
            merged.set(entry.getKey(), (baseValue != null && baseValue.isObject() && overrideValue.isObject())
                    ? deepMerge(baseValue, overrideValue) : overrideValue);
        }
        return merged;
    }

    /**
     * 计算 full 相对 base 的稀疏差异：只保留值不同的叶子字段，相同的字段整个省略，
     * 用于把系统主题的编辑结果收窄成「只含改动过的字段」的 overrideJson。
     */
    private JsonNode sparseDiff(JsonNode full, JsonNode base) {
        ObjectNode diff = objectMapper.createObjectNode();
        if (full == null || !full.isObject()) return diff;
        Iterator<String> names = full.fieldNames();
        while (names.hasNext()) {
            String key = names.next();
            JsonNode fullValue = full.get(key);
            JsonNode baseValue = base == null ? null : base.get(key);
            if (fullValue.isObject() && (baseValue == null || baseValue.isObject())) {
                JsonNode nested = sparseDiff(fullValue, baseValue);
                if (nested.size() > 0) diff.set(key, nested);
            } else if (!fullValue.equals(baseValue)) {
                diff.set(key, fullValue);
            }
        }
        return diff;
    }

    /** override 里的叶子字段数，供前端显示「已自定义 N 项」。数组算一个叶子，不展开数它的元素。 */
    private int countLeaves(JsonNode node) {
        if (node == null || node.isNull() || node.isMissingNode()) return 0;
        if (!node.isObject()) return 1;
        int count = 0;
        Iterator<JsonNode> values = node.elements();
        while (values.hasNext()) count += countLeaves(values.next());
        return count;
    }
}
