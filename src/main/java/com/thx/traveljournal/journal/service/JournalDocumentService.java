package com.thx.traveljournal.journal.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.thx.traveljournal.common.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

/**
 * 日记 Block 文档的唯一协议入口。
 *
 * <p>编辑器、模板和公开渲染都只读写 {@code schemaVersion + blocks}。这里不接受
 * Markdown、HTML 或未知节点，避免以后新增组件时继续维护第二套正文语法。</p>
 */
@Service
@RequiredArgsConstructor
public class JournalDocumentService {
    public static final int SCHEMA_VERSION = 1;
    public static final int MAX_BLOCKS = 200;
    private static final int MAX_DOCUMENT_BYTES = 1_000_000;
    private static final int MAX_TEXT_LENGTH = 50_000;
    /**
     * 正文支持的全部区块类型，也是「添加区块」面板和日记模板共用的那一份清单。
     *
     * <p>public 是为了让 {@link com.thx.traveljournal.journaltemplate.service.JournalTemplateService}
     * 直接复用：模板能选的区块必须和编辑器能加的区块严格一致，各留一份白名单迟早会分叉——
     * 上一版就是这么长出 text/textarea 这种编辑器里根本不存在的类型的。
     * 前端对应的是 frontend/src/journal/catalog.ts 的 CATALOG。</p>
     */
    public static final Set<String> BLOCK_TYPES = Set.of(
            "heading", "paragraph", "quote", "rating", "checklist", "trip-info",
            "route", "itinerary", "timeline", "expense-summary", "image", "gallery",
            "postcard", "divider", "callout", "facts", "pros-cons", "table", "link-card",
            "stats", "companions", "location-card", "food", "stay", "transport", "weather",
            // 一天的开头、中间和结尾。三个都能从旅行数据自动填出来，作者不用重复录入
            "day-opener", "chapter", "day-summary");
    private static final Set<String> IMAGE_SIZES = Set.of("small", "medium", "large", "full");
    private static final Set<String> IMAGE_ALIGNS = Set.of("left", "center", "right");
    private static final Set<String> GALLERY_LAYOUTS = Set.of(
            "row", "grid", "mosaic", "carousel", "filmstrip", "compare");
    private static final Set<String> IMAGE_RATIOS = Set.of("16x9", "4x3", "1x1", "3x4");
    private static final Set<String> IMAGE_FRAMES = Set.of("none", "tape", "film");
    private static final Set<String> IMAGE_RADII = Set.of("none", "soft", "round");
    private static final Set<String> IMAGE_EFFECTS = Set.of("lift", "zoom", "tilt");
    private static final Set<String> CAPTION_POSITIONS = Set.of("left", "side", "none");
    private static final Set<String> PARAGRAPH_STYLES = Set.of("normal", "lead", "note");

    /**
     * 已经下线的图片设置值 → 保留集合里的替代值。
     *
     * <p>通栏出血、瀑布流那一批版式、除胶带和胶片以外的相框、以及整个色调设置在这一版撤掉了。
     * 库里的老正文由 Flyway 迁移搬过一次，但作者浏览器 IndexedDB 里的本机草稿快照迁移够不着，
     * 那份快照回来时带的仍是旧值。直接 400 会让自动保存一路失败，所以在这里静默搬运。
     * 这张表和前端 frontend/src/journal/document.ts 的那份一一对应，两边必须同时改。</p>
     */
    private static final Map<String, Map<String, String>> RETIRED_SETTING_VALUES = Map.of(
            "size", Map.of("bleed", "full"),
            "layout", Map.of("masonry", "grid", "story", "grid", "staggered", "grid", "magazine", "mosaic"),
            "frame", Map.of("line", "none", "paper", "none", "float", "none",
                    "polaroid", "none", "postcard", "none"),
            "captionPos", Map.of("overlay", ""));
    /** 整项下线的设置，直接删掉。 */
    private static final Set<String> RETIRED_SETTING_KEYS = Set.of("tone");

    private final ObjectMapper objectMapper;

    public ObjectNode emptyDocument() {
        ObjectNode document = objectMapper.createObjectNode();
        document.put("schemaVersion", SCHEMA_VERSION);
        document.putArray("blocks");
        return document;
    }

    /** 校验并返回深拷贝，调用方可以安全交给 MyBatis 持久化。 */
    public JsonNode validate(JsonNode source, boolean publishing) {
        if (source == null || !source.isObject()) throw BusinessException.badRequest("日记正文格式不正确");
        if (source.path("schemaVersion").asInt(-1) != SCHEMA_VERSION)
            throw BusinessException.badRequest("不支持的日记正文版本");
        if (!source.path("blocks").isArray()) throw BusinessException.badRequest("日记正文缺少区块列表");
        ensureDocumentSize(source);

        // 先深拷贝再搬运下线设置，校验跑在搬运之后的结果上——否则老快照会被自己已经不合法的旧值挡下来
        JsonNode normalized = source.deepCopy();
        ArrayNode blocks = (ArrayNode) normalized.path("blocks");
        if (blocks.size() > MAX_BLOCKS) throw BusinessException.badRequest("一篇日记最多包含 " + MAX_BLOCKS + " 个区块");
        if (publishing && blocks.isEmpty()) throw BusinessException.badRequest("发布前请至少添加一个内容区块");

        Set<String> ids = new HashSet<>();
        boolean meaningful = false;
        for (JsonNode block : blocks) {
            if (!block.isObject()) throw BusinessException.badRequest("日记区块格式不正确");
            String id = block.path("id").asText("");
            String type = block.path("type").asText("");
            if (!id.matches("[A-Za-z0-9][A-Za-z0-9_-]{5,79}") || !ids.add(id))
                throw BusinessException.badRequest("日记区块标识不合法或重复");
            if (!BLOCK_TYPES.contains(type)) throw BusinessException.badRequest("不支持的日记区块：" + type);
            if (block.path("version").asInt(1) != 1) throw BusinessException.badRequest("不支持的区块版本：" + type);
            if (!block.path("data").isObject()) throw BusinessException.badRequest("区块数据必须是对象：" + type);
            if (block.has("settings") && !block.path("settings").isObject())
                throw BusinessException.badRequest("区块外观设置必须是对象：" + type);
            if (block.path("title").asText("").length() > 100) throw BusinessException.badRequest("区块标题不能超过 100 个字符");
            validateNodeText(block.path("data"));
            migrateRetiredSettings(block.path("settings"));
            validateSettings(type, block.path("settings"));
            meaningful |= isMeaningful(type, block.path("data"));
        }
        if (publishing && !meaningful) throw BusinessException.badRequest("发布前请填写日记正文");
        return normalized;
    }

    private void migrateRetiredSettings(JsonNode settings) {
        if (!(settings instanceof ObjectNode object)) return;
        RETIRED_SETTING_KEYS.forEach(object::remove);
        RETIRED_SETTING_VALUES.forEach((key, mapping) -> {
            String replacement = mapping.get(object.path(key).asText(""));
            if (replacement != null) object.put(key, replacement);
        });
    }

    /** 提取文档引用的媒体 id，JournalService 用它校验图片归属。 */
    public Set<Long> mediaIds(JsonNode document) {
        Set<Long> result = new LinkedHashSet<>();
        if (document == null || !document.path("blocks").isArray()) return result;
        for (JsonNode block : document.path("blocks")) {
            JsonNode data = block.path("data");
            collectMediaIds(data.path("mediaIds"), result);
            collectMediaIds(data.path("mediaId"), result);
        }
        return result;
    }

    private void collectMediaIds(JsonNode node, Set<Long> target) {
        if (node == null || node.isMissingNode() || node.isNull()) return;
        if (node.isArray()) {
            for (JsonNode item : node) collectMediaIds(item, target);
        } else if (node.canConvertToLong() && node.asLong() > 0) {
            target.add(node.asLong());
        } else {
            throw BusinessException.badRequest("图片区块包含无效的媒体编号");
        }
    }

    private void validateSettings(String type, JsonNode settings) {
        if (settings == null || settings.isMissingNode()) return;
        String size = settings.path("size").asText("");
        String align = settings.path("align").asText("");
        String layout = settings.path("layout").asText("");
        if (StringUtils.hasText(size) && !IMAGE_SIZES.contains(size)) throw BusinessException.badRequest("不支持的图片尺寸");
        if (StringUtils.hasText(align) && !IMAGE_ALIGNS.contains(align)) throw BusinessException.badRequest("不支持的图片对齐方式");
        if (("gallery".equals(type) || "postcard".equals(type))
                && StringUtils.hasText(layout) && !GALLERY_LAYOUTS.contains(layout) && !"postcard".equals(layout))
            throw BusinessException.badRequest("不支持的图片布局");
        int columns = settings.path("columns").asInt(3);
        if (columns < 1 || columns > 6) throw BusinessException.badRequest("图片列数必须在 1 到 6 之间");
        validateAllowedSetting(settings, "ratio", IMAGE_RATIOS);
        validateAllowedSetting(settings, "frame", IMAGE_FRAMES);
        validateAllowedSetting(settings, "radius", IMAGE_RADII);
        validateAllowedSetting(settings, "effect", IMAGE_EFFECTS);
        validateAllowedSetting(settings, "captionPos", CAPTION_POSITIONS);
        validateAllowedSetting(settings, "style", PARAGRAPH_STYLES);
    }

    private void validateAllowedSetting(JsonNode settings, String name, Set<String> allowed) {
        String value = settings.path(name).asText("");
        if (StringUtils.hasText(value) && !allowed.contains(value))
            throw BusinessException.badRequest("不支持的区块设置：" + name);
    }

    private boolean isMeaningful(String type, JsonNode data) {
        return switch (type) {
            case "divider" -> true;
            case "heading", "paragraph", "quote", "callout" -> StringUtils.hasText(data.path("text").asText());
            case "rating" -> data.path("score").asInt(0) > 0 || StringUtils.hasText(data.path("comment").asText());
            case "checklist", "route", "itinerary", "timeline", "expense-summary" ->
                    (data.path("items").isArray() && !data.path("items").isEmpty())
                            || (data.path("categories").isArray() && !data.path("categories").isEmpty());
            case "trip-info" -> data.fields().hasNext();
            case "image", "gallery" -> !mediaIdsFromData(data).isEmpty();
            case "postcard" -> !mediaIdsFromData(data).isEmpty() || StringUtils.hasText(data.path("message").asText());
            case "facts", "stats", "companions" -> data.path("items").isArray() && !data.path("items").isEmpty();
            case "pros-cons" -> (data.path("pros").isArray() && !data.path("pros").isEmpty())
                    || (data.path("cons").isArray() && !data.path("cons").isEmpty());
            case "table" -> data.path("rows").isArray() && !data.path("rows").isEmpty();
            case "link-card" -> StringUtils.hasText(data.path("title").asText())
                    || StringUtils.hasText(data.path("url").asText());
            case "location-card" -> StringUtils.hasText(data.path("name").asText())
                    || StringUtils.hasText(data.path("impression").asText());
            case "food" -> StringUtils.hasText(data.path("dish").asText())
                    || StringUtils.hasText(data.path("note").asText());
            case "stay" -> StringUtils.hasText(data.path("name").asText())
                    || StringUtils.hasText(data.path("note").asText());
            case "transport" -> StringUtils.hasText(data.path("from").asText())
                    || StringUtils.hasText(data.path("to").asText())
                    || StringUtils.hasText(data.path("note").asText());
            case "weather" -> StringUtils.hasText(data.path("condition").asText())
                    || StringUtils.hasText(data.path("note").asText());
            case "day-opener" -> StringUtils.hasText(data.path("city").asText())
                    || StringUtils.hasText(data.path("date").asText())
                    || (data.path("route").isArray() && !data.path("route").isEmpty());
            case "chapter" -> StringUtils.hasText(data.path("title").asText())
                    || StringUtils.hasText(data.path("time").asText());
            case "day-summary" -> data.path("items").isArray() && !data.path("items").isEmpty();
            default -> false;
        };
    }

    private Set<Long> mediaIdsFromData(JsonNode data) {
        Set<Long> ids = new HashSet<>();
        collectMediaIds(data.path("mediaIds"), ids);
        collectMediaIds(data.path("mediaId"), ids);
        return ids;
    }

    private void validateNodeText(JsonNode node) {
        if (node.isTextual() && node.asText().length() > MAX_TEXT_LENGTH)
            throw BusinessException.badRequest("单个区块文字不能超过 " + MAX_TEXT_LENGTH + " 个字符");
        if (node.isContainerNode()) node.elements().forEachRemaining(this::validateNodeText);
    }

    private void ensureDocumentSize(JsonNode document) {
        try {
            if (objectMapper.writeValueAsBytes(document).length > MAX_DOCUMENT_BYTES)
                throw BusinessException.badRequest("日记正文不能超过 1 MB");
        } catch (JsonProcessingException e) {
            throw BusinessException.badRequest("日记正文格式不正确");
        }
    }
}
