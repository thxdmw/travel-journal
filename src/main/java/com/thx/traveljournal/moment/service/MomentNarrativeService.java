package com.thx.traveljournal.moment.service;

import com.anthropic.client.AnthropicClient;
import com.anthropic.client.okhttp.AnthropicOkHttpClient;
import com.anthropic.models.messages.Message;
import com.anthropic.models.messages.MessageCreateParams;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.thx.traveljournal.common.util.SiteClock;
import com.thx.traveljournal.config.AppProperties;
import com.thx.traveljournal.moment.entity.Moment;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 用 AI 把一天的随手记润色成能读的段落。
 *
 * <p><b>这里刻意只做一件事：改写文字。</b>顺序、时间、地点、照片归属全部由
 * {@link MomentComposer} 用规则决定，AI 拿不到也改不了。理由是这些东西必须百分之百可靠，
 * 而它们恰好是规则最擅长的；模型擅长的是把「浅草看到一只很胖的柴犬」这样的碎片
 * 串成一段读得下去的话。让各自做各自最擅长的那部分，出错的面就小得多。</p>
 *
 * <p>失败是常态而不是异常：没配 key、网络不通、模型拒答、返回的 JSON 对不上——
 * 每一种都退回原文，整理照常完成。作者宁可看到自己写的原句，也不该因为 AI 不可用
 * 就整理不出日记。</p>
 */
@Slf4j
@Service
public class MomentNarrativeService {
    private static final DateTimeFormatter HOUR_MINUTE = DateTimeFormatter.ofPattern("HH:mm");
    /** 一次最多润色多少条。再多就该分两天整理了，也避免单次请求过大。 */
    private static final int MAX_MOMENTS = 40;

    /**
     * 系统提示。
     *
     * <p>写得这么克制是有原因的：润色游记最容易出的问题是模型「帮你回忆」——
     * 补出一个没去过的地方、一句没说过的话、一种没有的天气。所以这里反复强调只能改写，
     * 并且把输出限制成一个 id → 文字的映射，让它没有地方去添加新东西。</p>
     */
    private static final String SYSTEM = """
            你在帮一个人整理他自己的旅行随手记。这些是他当天在路上顺手记下的碎片，
            现在要变成一篇日记里的段落。

            你的任务只有一个：把每条碎片改写得更连贯、更像在讲述，保留原本的语气。

            必须遵守：
            - 只能改写已经写下的内容。绝对不要添加原文没有的地点、人物、时间、天气、
              食物、情绪或任何事实。作者没写的，就是没发生。
            - 不要合并或拆分条目，一条进、一条出。
            - 保持第一人称，保持原本的口吻。原文简短随意的，改写后也应该简短随意，
              不要写成散文或抒情文。
            - 每条一般一到三句话，不要变长。
            - 原文只有几个字或只是一个词的，原样返回，不要硬扩写。
            - 不要加标题、不要加时间、不要加地点前缀——这些由程序自己排版。

            输出严格是一个 JSON 对象，不要有任何解释文字，不要用 markdown 代码块包裹：
            {"items":[{"id":"<原样返回>","text":"<改写后的文字>"}]}
            """;

    private final AppProperties properties;
    private final ObjectMapper objectMapper;
    private final SiteClock clock;
    /** 没配 key 时为 null，此时 {@link #available()} 返回 false，调用方走原文那条路。 */
    private final AnthropicClient client;

    public MomentNarrativeService(AppProperties properties, ObjectMapper objectMapper, SiteClock clock) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.clock = clock;
        AppProperties.Ai ai = properties.ai();
        this.client = ai != null && ai.configured()
                ? AnthropicOkHttpClient.builder().apiKey(ai.apiKey()).build() : null;
        if (this.client == null) log.info("未配置 app.ai.api-key，随手记整理将直接使用原文");
    }

    /** 是否可以润色。前端据此决定要不要显示「AI 整理」这个选项。 */
    public boolean available() {
        return client != null;
    }

    /**
     * 润色一天的随手记，返回 moment id → 改写后文字。
     *
     * <p>任何一条没有对应结果时调用方保留原文，所以返回的映射允许不完整。
     * 出错时返回空映射而不是抛异常——整理不该因为润色失败而失败。</p>
     */
    public Map<Long, String> rewrite(List<Moment> moments) {
        if (!available() || moments == null || moments.isEmpty()) return Map.of();
        List<Moment> targets = moments.stream()
                .filter(moment -> StringUtils.hasText(moment.getContent()))
                .limit(MAX_MOMENTS).toList();
        if (targets.isEmpty()) return Map.of();
        try {
            Message message = client.messages().create(MessageCreateParams.builder()
                    .model(properties.ai().model())
                    // 输出是一小段 JSON，但 Opus 5 默认开着思考，两者共用这个上限，所以留够余量
                    .maxTokens(16000)
                    .system(SYSTEM)
                    .addUserMessage(prompt(targets))
                    .build());
            /*
             * 安全分类器可能拒答（HTTP 200，stop_reason=refusal，content 为空）。
             * 旅行日记几乎不会碰到，但不检查就会在读 content 时炸掉，
             * 而那一刻作者正等着他的日记。
             */
            String stopReason = message.stopReason().map(Object::toString).orElse("");
            if (stopReason.toLowerCase().contains("refusal")) {
                log.warn("AI 拒绝润色这批随手记，已退回原文");
                return Map.of();
            }
            return parse(text(message), targets);
        } catch (Exception e) {
            log.warn("AI 润色失败，已退回原文：{}", e.getMessage());
            return Map.of();
        }
    }

    /** 把响应里的文本块拼起来。 */
    private String text(Message message) {
        StringBuilder builder = new StringBuilder();
        message.content().forEach(block -> block.text().ifPresent(part -> builder.append(part.text())));
        return builder.toString();
    }

    /**
     * 每条一行，带上 id 让模型原样回填。
     *
     * <p>时间和地点给出来是为了让改写读起来有上下文，但提示里已经说明不要把它们写进正文——
     * 排版由程序负责。</p>
     */
    private String prompt(List<Moment> moments) {
        StringBuilder builder = new StringBuilder();
        builder.append("这是同一天的随手记，按时间先后排列。请逐条改写。\n\n");
        for (Moment moment : moments) {
            builder.append("id: ").append(moment.getId()).append('\n');
            if (moment.getOccurredAt() != null)
                builder.append("时间: ")
                        .append(moment.getOccurredAt().atZoneSameInstant(clock.zone()).format(HOUR_MINUTE))
                        .append('\n');
            if (StringUtils.hasText(moment.getPlaceName()))
                builder.append("地点: ").append(moment.getPlaceName()).append('\n');
            if (StringUtils.hasText(moment.getMood()))
                builder.append("心情: ").append(moment.getMood()).append('\n');
            builder.append("原文: ").append(moment.getContent()).append("\n\n");
        }
        return builder.toString();
    }

    /**
     * 解析返回的 JSON。
     *
     * <p>只接受属于这一批的 id，只接受非空文字——模型偶尔会返回多余的条目或空串，
     * 那些直接丢掉，对应的随手记就保留原文。</p>
     */
    private Map<Long, String> parse(String raw, List<Moment> targets) {
        Map<Long, String> result = new LinkedHashMap<>();
        String payload = raw == null ? "" : raw.trim();
        // 提示里要求不要用代码块，但模型偶尔还是会包一层，取第一个 { 到最后一个 } 之间的部分
        int start = payload.indexOf('{'), end = payload.lastIndexOf('}');
        if (start < 0 || end <= start) return result;
        try {
            JsonNode items = objectMapper.readTree(payload.substring(start, end + 1)).path("items");
            if (!items.isArray()) return result;
            var allowed = targets.stream().map(Moment::getId).collect(java.util.stream.Collectors.toSet());
            for (JsonNode item : items) {
                long id = item.path("id").asLong(0);
                String text = item.path("text").asText("").trim();
                if (allowed.contains(id) && !text.isEmpty()) result.put(id, text);
            }
        } catch (Exception e) {
            log.warn("AI 返回的内容不是预期的 JSON，已退回原文：{}", e.getMessage());
        }
        return result;
    }
}
