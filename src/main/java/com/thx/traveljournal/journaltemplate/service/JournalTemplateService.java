package com.thx.traveljournal.journaltemplate.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.thx.traveljournal.budget.entity.BudgetCategory;
import com.thx.traveljournal.budget.entity.Expense;
import com.thx.traveljournal.budget.mapper.BudgetCategoryMapper;
import com.thx.traveljournal.budget.mapper.ExpenseMapper;
import com.thx.traveljournal.common.exception.BusinessException;
import com.thx.traveljournal.itinerary.entity.ItineraryItem;
import com.thx.traveljournal.itinerary.mapper.ItineraryMapper;
import com.thx.traveljournal.journaltemplate.entity.JournalTemplate;
import com.thx.traveljournal.journaltemplate.mapper.JournalTemplateMapper;
import com.thx.traveljournal.media.service.MediaService;
import com.thx.traveljournal.trip.entity.Trip;
import com.thx.traveljournal.trip.entity.TripStop;
import com.thx.traveljournal.trip.mapper.TripMapper;
import com.thx.traveljournal.trip.mapper.TripStopMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 日记模板服务：模板的增删改查，以及按模板生成日记正文。
 *
 * <p>模板由一组区块组成，区块类型限定在 {@link #BLOCK_TYPES} 白名单内。
 * 生成正文时，路线、行程、花费这类区块会自动读取当天的旅行数据，
 * 用户填的文字则统一做 HTML 转义后再拼进 Markdown。</p>
 */
@Service
@RequiredArgsConstructor
public class JournalTemplateService {
    /** 允许的区块类型白名单。模板由用户自己搭，只认这些类型，杜绝脚本和任意 HTML */
    private static final Set<String> BLOCK_TYPES = Set.of(
            "trip-info", "text", "textarea", "quote", "rating", "checklist",
            "route", "itinerary", "expense-summary", "image", "gallery", "divider");
    private static final Set<String> IMAGE_SIZES = Set.of("small", "medium", "large", "full");
    private static final Set<String> IMAGE_ALIGNS = Set.of("left", "center", "right");

    private final JournalTemplateMapper mapper;
    private final TripMapper tripMapper;
    private final TripStopMapper stopMapper;
    private final ItineraryMapper itineraryMapper;
    private final ExpenseMapper expenseMapper;
    private final BudgetCategoryMapper budgetMapper;
    private final MediaService mediaService;
    private final ObjectMapper objectMapper;

    public record TemplateInput(String name, String description, String category,
                                JsonNode definitionJson, Boolean enabled) {}
    public record GenerateInput(Long journalId, Long tripId, Long tripStopId,
                                LocalDate occurredOn, JsonNode data) {}
    public record GenerateResult(String markdown, JsonNode data, JsonNode snapshot,
                                 Long templateId, Integer templateVersion) {}

    public List<JournalTemplate> list(boolean enabledOnly) {
        return mapper.selectList(new LambdaQueryWrapper<JournalTemplate>()
                .eq(enabledOnly, JournalTemplate::getEnabled, true)
                .orderByDesc(JournalTemplate::getBuiltin)
                .orderByDesc(JournalTemplate::getUpdatedAt));
    }

    public JournalTemplate get(Long id) {
        JournalTemplate template = mapper.selectById(id);
        if (template == null) throw BusinessException.notFound("日记模板不存在");
        return template;
    }

    public JournalTemplate create(TemplateInput input) {
        JournalTemplate template = new JournalTemplate();
        copyInput(input, template);
        template.setVersion(1);
        template.setBuiltin(false);
        mapper.insert(template);
        return template;
    }

    /** 更新个人模板。系统内置模板不允许直接改，要先复制成个人模板。 */
    public JournalTemplate update(Long id, TemplateInput input) {
        JournalTemplate template = get(id);
        if (Boolean.TRUE.equals(template.getBuiltin()))
            throw BusinessException.conflict("系统模板不能直接修改，请先复制为我的模板");
        copyInput(input, template);
        template.setVersion(template.getVersion() + 1);
        mapper.updateById(template);
        return template;
    }

    public void delete(Long id) {
        JournalTemplate template = get(id);
        if (Boolean.TRUE.equals(template.getBuiltin()))
            throw BusinessException.conflict("系统模板不能删除");
        mapper.deleteById(id);
    }

    public JournalTemplate duplicate(Long id) {
        JournalTemplate source = get(id);
        JournalTemplate copy = new JournalTemplate();
        copy.setName(source.getName() + " 副本");
        copy.setDescription(source.getDescription());
        copy.setCategory("CUSTOM");
        copy.setDefinitionJson(source.getDefinitionJson().deepCopy());
        copy.setVersion(1);
        copy.setEnabled(true);
        copy.setBuiltin(false);
        mapper.insert(copy);
        return copy;
    }

    @Transactional(readOnly = true)
    /**
     * 按模板生成日记正文。
     *
     * <p>旅行、路线、行程和支出这些区块会自动从库里读当天的数据填好，
     * 用户只需要填天气、心情、感受这类只有本人知道的内容。</p>
     *
     * @return 生成的 Markdown、回填的数据、模板定义快照和版本号
     */
    public GenerateResult generate(Long templateId, GenerateInput input) {
        JournalTemplate template = get(templateId);
        if (!Boolean.TRUE.equals(template.getEnabled())) throw BusinessException.badRequest("该模板已停用");
        if (input.tripId() == null || input.occurredOn() == null)
            throw BusinessException.badRequest("请选择旅行和日记日期");
        Trip trip = tripMapper.selectById(input.tripId());
        if (trip == null) throw BusinessException.badRequest("所属旅行不存在");
        TripStop selectedStop = null;
        if (input.tripStopId() != null) {
            selectedStop = stopMapper.selectById(input.tripStopId());
            if (selectedStop == null || !trip.getId().equals(selectedStop.getTripId()))
                throw BusinessException.badRequest("城市不属于当前旅行");
        }

        List<TripStop> stops = stopMapper.selectList(new LambdaQueryWrapper<TripStop>()
                .eq(TripStop::getTripId, trip.getId())
                .orderByAsc(TripStop::getSortOrder, TripStop::getId));
        List<ItineraryItem> itinerary = itineraryMapper.selectList(new LambdaQueryWrapper<ItineraryItem>()
                .eq(ItineraryItem::getTripId, trip.getId())
                .eq(ItineraryItem::getItemDate, input.occurredOn())
                .orderByAsc(ItineraryItem::getStartTime, ItineraryItem::getSortOrder, ItineraryItem::getId));
        List<Expense> dayExpenses = expenseMapper.selectList(new LambdaQueryWrapper<Expense>()
                .eq(Expense::getTripId, trip.getId())
                .eq(Expense::getExpenseDate, input.occurredOn())
                .orderByAsc(Expense::getId));
        List<Expense> tripExpenses = expenseMapper.selectList(new LambdaQueryWrapper<Expense>()
                .eq(Expense::getTripId, trip.getId())
                .orderByAsc(Expense::getExpenseDate, Expense::getId));
        Map<Long, String> categoryNames = budgetMapper.selectList(new LambdaQueryWrapper<BudgetCategory>()
                        .eq(BudgetCategory::getTripId, trip.getId())).stream()
                .collect(Collectors.toMap(BudgetCategory::getId, BudgetCategory::getName, (a, b) -> a));
        Map<Long, MediaService.MediaView> media = input.journalId() == null ? Map.of()
                : mediaService.list(input.journalId()).stream()
                .collect(Collectors.toMap(MediaService.MediaView::id, value -> value));

        ObjectNode data = input.data() != null && input.data().isObject()
                ? ((ObjectNode) input.data()).deepCopy() : objectMapper.createObjectNode();
        ObjectNode context = data.withObject("_context");
        context.put("tripTitle", trip.getTitle());
        context.put("occurredOn", input.occurredOn().toString());
        if (selectedStop != null) context.put("cityName", selectedStop.getCityName());

        StringBuilder markdown = new StringBuilder();
        ArrayNode blocks = (ArrayNode) template.getDefinitionJson().path("blocks");
        for (JsonNode block : blocks) {
            validateRequiredBlock(block, data);
            appendBlock(markdown, block, data, trip, selectedStop, stops, itinerary,
                    dayExpenses, tripExpenses, categoryNames, media);
        }
        return new GenerateResult(markdown.toString().trim(), data,
                template.getDefinitionJson().deepCopy(), template.getId(), template.getVersion());
    }

    private void copyInput(TemplateInput input, JournalTemplate target) {
        if (!StringUtils.hasText(input.name()) || input.name().trim().length() > 120)
            throw BusinessException.badRequest("模板名称不能为空且不能超过 120 个字符");
        if (StringUtils.hasText(input.description()) && input.description().length() > 500)
            throw BusinessException.badRequest("模板说明不能超过 500 个字符");
        JsonNode definition = validateDefinition(input.definitionJson());
        target.setName(input.name().trim());
        target.setDescription(StringUtils.hasText(input.description()) ? input.description().trim() : null);
        target.setCategory(StringUtils.hasText(input.category()) ? input.category().trim().toUpperCase() : "CUSTOM");
        target.setDefinitionJson(definition);
        target.setEnabled(input.enabled() == null || input.enabled());
    }

    /** 校验模板定义：必须是对象、至少一个区块、区块类型在白名单内、图片尺寸和对齐取值合法。 */
    private JsonNode validateDefinition(JsonNode definition) {
        if (definition == null || !definition.isObject() || !definition.path("blocks").isArray())
            throw BusinessException.badRequest("模板定义必须包含区块列表");
        ArrayNode blocks = (ArrayNode) definition.path("blocks");
        if (blocks.isEmpty() || blocks.size() > 30)
            throw BusinessException.badRequest("模板需要 1 到 30 个区块");
        Set<String> ids = new HashSet<>();
        for (JsonNode block : blocks) {
            String id = block.path("id").asText("");
            String type = block.path("type").asText("");
            String title = block.path("title").asText("");
            if (!id.matches("[A-Za-z][A-Za-z0-9_-]{0,39}") || !ids.add(id))
                throw BusinessException.badRequest("区块标识必须唯一，且只能包含字母、数字、下划线和短横线");
            if (!BLOCK_TYPES.contains(type)) throw BusinessException.badRequest("不支持的区块类型：" + type);
            if (title.length() > 100) throw BusinessException.badRequest("区块标题不能超过 100 个字符");
            if (block.has("config") && !block.path("config").isObject())
                throw BusinessException.badRequest("区块配置必须是对象");
        }
        return definition.deepCopy();
    }

    private void appendBlock(StringBuilder out, JsonNode block, ObjectNode data,
                             Trip trip, TripStop selectedStop, List<TripStop> stops,
                             List<ItineraryItem> itinerary, List<Expense> dayExpenses,
                             List<Expense> tripExpenses, Map<Long, String> categoryNames,
                             Map<Long, MediaService.MediaView> media) {
        String type = block.path("type").asText();
        String title = block.path("title").asText();
        JsonNode config = block.path("config");
        JsonNode value = blockValue(data.path(block.path("id").asText()));
        String content = switch (type) {
            case "trip-info" -> tripInfo(trip, selectedStop, data, block.path("id").asText());
            case "route" -> route(config, stops, itinerary);
            case "itinerary" -> itinerary(itinerary);
            case "expense-summary" -> expenseSummary(
                    "trip".equals(config.path("source").asText()) ? tripExpenses : dayExpenses,
                    categoryNames, trip.getDefaultCurrency());
            case "quote" -> StringUtils.hasText(value.asText()) ? "> " + value.asText().replace("\n", "\n> ") : "";
            case "rating" -> rating(value, config.path("max").asInt(5));
            case "checklist" -> checklist(value);
            case "image", "gallery" -> images(value, config, media, "gallery".equals(type));
            case "divider" -> "---";
            default -> value.isTextual() ? value.asText() : "";
        };
        if (!StringUtils.hasText(content)) return;
        if (StringUtils.hasText(title) && !"divider".equals(type)) out.append("## ").append(title).append("\n\n");
        out.append(content.trim()).append("\n\n");
    }

    private String tripInfo(Trip trip, TripStop stop, ObjectNode data, String blockId) {
        List<String> pieces = new ArrayList<>();
        pieces.add(data.path("_context").path("occurredOn").asText());
        if (stop != null) pieces.add(stop.getCityName());
        pieces.add(trip.getTitle());
        JsonNode blockData = data.path(blockId);
        addIfText(pieces, blockData.path("weather"));
        addIfText(pieces, blockData.path("mood"));
        return "> " + String.join(" · ", pieces);
    }

    private String route(JsonNode config, List<TripStop> stops, List<ItineraryItem> itinerary) {
        if ("trip".equals(config.path("source").asText())) {
            return stops.stream().map(TripStop::getCityName).filter(StringUtils::hasText)
                    .collect(Collectors.joining(" → "));
        }
        return itinerary.stream().map(ItineraryItem::getTitle).filter(StringUtils::hasText)
                .collect(Collectors.joining(" → "));
    }

    private String itinerary(List<ItineraryItem> items) {
        return items.stream().map(item -> {
            String time = item.getStartTime() == null ? "" : item.getStartTime().format(DateTimeFormatter.ofPattern("HH:mm "));
            String address = StringUtils.hasText(item.getAddress()) ? "（" + item.getAddress() + "）" : "";
            return "- " + time + item.getTitle() + address;
        }).collect(Collectors.joining("\n"));
    }

    private String expenseSummary(List<Expense> expenses, Map<Long, String> categoryNames, String currency) {
        if (expenses.isEmpty()) return "";
        Map<String, BigDecimal> grouped = new LinkedHashMap<>();
        for (Expense expense : expenses) {
            String name = categoryNames.getOrDefault(expense.getBudgetCategoryId(), "其他");
            grouped.merge(name, expense.getAmount(), BigDecimal::add);
        }
        StringBuilder result = new StringBuilder();
        BigDecimal total = BigDecimal.ZERO;
        for (Map.Entry<String, BigDecimal> item : grouped.entrySet()) {
            result.append("- ").append(item.getKey()).append("：")
                    .append(currency).append(' ').append(item.getValue().stripTrailingZeros().toPlainString()).append('\n');
            total = total.add(item.getValue());
        }
        return result.append("\n**合计：").append(currency).append(' ')
                .append(total.stripTrailingZeros().toPlainString()).append("**").toString();
    }

    private String rating(JsonNode value, int max) {
        int score = Math.max(0, Math.min(max, value.asInt(0)));
        return score == 0 ? "" : "★".repeat(score) + "☆".repeat(Math.max(0, max - score)) + "（" + score + "/" + max + "）";
    }

    private String checklist(JsonNode value) {
        if (!value.isArray()) return "";
        List<String> rows = new ArrayList<>();
        for (JsonNode item : value) {
            if (item.isTextual()) rows.add("- [ ] " + item.asText());
            else if (item.isObject() && StringUtils.hasText(item.path("text").asText()))
                rows.add("- [" + (item.path("checked").asBoolean() ? "x" : " ") + "] " + item.path("text").asText());
        }
        return String.join("\n", rows);
    }

    private String images(JsonNode value, JsonNode config, Map<Long, MediaService.MediaView> media, boolean multiple) {
        List<Long> ids = new ArrayList<>();
        JsonNode source = value.isObject() && value.has("mediaIds") ? value.path("mediaIds") : value;
        if (source.isArray()) {
            for (JsonNode node : source) if (node.canConvertToLong()) ids.add(node.asLong());
        }
        else if (source.canConvertToLong()) ids.add(source.asLong());
        if (!multiple && ids.size() > 1) ids = ids.subList(0, 1);
        String size = IMAGE_SIZES.contains(config.path("imageSize").asText()) ? config.path("imageSize").asText() : "medium";
        String align = IMAGE_ALIGNS.contains(config.path("align").asText()) ? config.path("align").asText() : "center";
        List<String> figures = new ArrayList<>();
        for (Long id : ids) {
            MediaService.MediaView item = media.get(id);
            if (item == null) throw BusinessException.badRequest("模板选择的图片不属于当前日记");
            figures.add(figure(item, size, align));
        }
        return String.join("\n\n", figures);
    }

    private String figure(MediaService.MediaView item, String size, String align) {
        String caption = StringUtils.hasText(item.caption()) ? item.caption() : item.filename();
        String safe = escapeHtml(caption);
        return "<figure class=\"journal-figure journal-figure--" + size + " journal-figure--" + align + "\">\n"
                + "  <img src=\"" + item.displayUrl() + "\" alt=\"" + safe + "\" loading=\"lazy\">\n"
                + (StringUtils.hasText(caption) ? "  <figcaption>" + safe + "</figcaption>\n" : "")
                + "</figure>";
    }

    private JsonNode blockValue(JsonNode blockData) {
        return blockData.isObject() && blockData.has("value") ? blockData.path("value") : blockData;
    }

    /** 校验标记为必填的区块确实填了内容。 */
    private void validateRequiredBlock(JsonNode block, ObjectNode data) {
        if (!block.path("required").asBoolean(false)) return;
        String type = block.path("type").asText();
        if (Set.of("trip-info", "route", "itinerary", "expense-summary", "divider").contains(type)) return;
        JsonNode raw = data.path(block.path("id").asText());
        JsonNode value = blockValue(raw);
        boolean filled;
        if (Set.of("image", "gallery").contains(type)) {
            JsonNode mediaIds = raw.isObject() ? raw.path("mediaIds") : raw;
            filled = (mediaIds.isArray() && !mediaIds.isEmpty()) || mediaIds.canConvertToLong();
        } else if ("rating".equals(type)) {
            filled = value.asInt(0) > 0;
        } else if ("checklist".equals(type)) {
            filled = value.isArray() && !value.isEmpty();
        } else {
            filled = value.isTextual() && StringUtils.hasText(value.asText());
        }
        if (!filled) throw BusinessException.badRequest("请填写模板区块：“" + block.path("title").asText("未命名区块") + "”");
    }

    private void addIfText(List<String> values, JsonNode node) {
        if (node.isTextual() && StringUtils.hasText(node.asText())) values.add(node.asText().trim());
    }

    /** 转义 HTML 特殊字符。模板生成的 figure 标签会直接进正文，用户填的内容必须先转义。 */
    private String escapeHtml(String value) {
        return value == null ? "" : value.replace("&", "&amp;").replace("<", "&lt;")
                .replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&#39;");
    }
}
