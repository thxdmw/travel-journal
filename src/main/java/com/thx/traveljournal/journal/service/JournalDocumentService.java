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
    private static final Set<String> BLOCK_TYPES = Set.of(
            "heading", "paragraph", "quote", "rating", "checklist", "trip-info",
            "route", "itinerary", "timeline", "expense-summary", "image", "gallery",
            "postcard", "divider", "callout", "facts", "pros-cons", "table", "link-card",
            "stats", "companions", "location-card", "food", "stay", "transport", "weather");
    private static final Set<String> IMAGE_SIZES = Set.of("small", "medium", "large", "full", "bleed");
    private static final Set<String> IMAGE_ALIGNS = Set.of("left", "center", "right");
    private static final Set<String> GALLERY_LAYOUTS = Set.of(
            "row", "grid", "masonry", "mosaic", "magazine", "story", "staggered",
            "carousel", "filmstrip", "compare");
    private static final Set<String> IMAGE_RATIOS = Set.of("16x9", "4x3", "1x1", "3x4");
    private static final Set<String> IMAGE_FRAMES = Set.of(
            "none", "line", "paper", "float", "polaroid", "tape", "film", "postcard");
    private static final Set<String> IMAGE_RADII = Set.of("none", "soft", "round");
    private static final Set<String> IMAGE_TONES = Set.of("warm", "vintage", "mono");
    private static final Set<String> IMAGE_EFFECTS = Set.of("lift", "zoom", "tilt");
    private static final Set<String> CAPTION_POSITIONS = Set.of("left", "overlay", "side", "none");
    private static final Set<String> PARAGRAPH_STYLES = Set.of("normal", "lead", "note");

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

        ArrayNode blocks = (ArrayNode) source.path("blocks");
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
            validateSettings(type, block.path("settings"));
            meaningful |= isMeaningful(type, block.path("data"));
        }
        if (publishing && !meaningful) throw BusinessException.badRequest("发布前请填写日记正文");
        return source.deepCopy();
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
        validateAllowedSetting(settings, "tone", IMAGE_TONES);
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
