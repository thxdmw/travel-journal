package com.thx.traveljournal.moment.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.thx.traveljournal.common.exception.BusinessException;
import com.thx.traveljournal.common.util.SiteClock;
import com.thx.traveljournal.journal.entity.JournalEntry;
import com.thx.traveljournal.journal.service.JournalService;
import com.thx.traveljournal.media.service.MediaService;
import com.thx.traveljournal.moment.entity.Moment;
import com.thx.traveljournal.trip.entity.Trip;
import com.thx.traveljournal.trip.entity.TripStop;
import com.thx.traveljournal.trip.mapper.TripMapper;
import com.thx.traveljournal.trip.mapper.TripStopMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 把一天的随手记整理成一篇日记草稿。
 *
 * <p>这是随手记这条产品线真正的价值所在：白天记下的十几条碎片，晚上一键变成一篇有
 * 开头、有时间线、有照片的日记草稿，作者只需要在上面接着写，而不是对着空白页回忆。</p>
 *
 * <p>第一版刻意不用 AI，只按时间排序。理由是这一步的正确性比文采重要得多——
 * 顺序、时间、照片归属这些必须百分之百可靠，而这些恰好是规则最擅长的。等结构稳定之后
 * 再让 AI 在上面润色，那才是它该出现的位置（见 {@code MomentNarrativeService}）。</p>
 */
@Service
@RequiredArgsConstructor
public class MomentComposer {
    private static final DateTimeFormatter HOUR_MINUTE = DateTimeFormatter.ofPattern("HH:mm");

    private final MomentService momentService;
    private final JournalService journalService;
    private final MediaService mediaService;
    private final TripMapper tripMapper;
    private final TripStopMapper stopMapper;
    private final ObjectMapper objectMapper;
    private final SiteClock clock;
    private final MomentNarrativeService narrativeService;

    /**
     * 整理结果。
     *
     * @param momentCount 用掉了几条随手记
     * @param created     这篇日记是不是刚建出来的
     * @param polished     文字有没有真的被 AI 润色过。请求了 AI 但润色失败时是 false，
     *                     前端据此告诉作者「这次用的是原文」
     */
    public record ComposeResult(Long journalId, int momentCount, int photoCount, boolean created,
                                boolean polished) {}

    /**
     * 把某一天的随手记整理成日记。
     *
     * @param journalId 追加到哪篇日记；为空则新建一篇草稿
     * @param replace   是否替换正文。false 时把生成的内容接在现有正文后面，
     *                  这样「白天整理一次、晚上再整理一次」不会把先写的东西冲掉。
     * @param useAi     是否让 AI 把碎片句子润色成段落。只影响文字，不影响顺序、时间、
     *                  地点和照片归属——那些永远由规则决定。润色失败时保留原文。
     */
    @Transactional
    public ComposeResult compose(Long tripId, LocalDate day, Long journalId, boolean replace, boolean useAi) {
        Trip trip = tripMapper.selectById(tripId);
        if (trip == null) throw BusinessException.badRequest("所属旅行不存在");
        if (day == null) day = clock.today();
        boolean created = journalId == null;
        JournalEntry journal = created ? null : journalService.get(journalId);
        if (journal != null) {
            if (!tripId.equals(journal.getTripId()))
                throw BusinessException.badRequest("目标日记不属于当前旅行");
            if (!"DRAFT".equals(journal.getStatus()))
                throw BusinessException.badRequest("已发布的日记不能直接整理，请先撤回");
        }

        List<Moment> moments = momentService.forCompose(tripId, day, journalId, replace);
        if (moments.isEmpty()) {
            throw BusinessException.badRequest(replace ? "这一天没有可重新整理的随手记" : "这一天没有新的随手记");
        }
        if (created) journal = newDraft(trip, day);

        // 照片先过继给日记：正文里的图片区块只存 media id，而日记只认属于自己的图片，
        // 所以必须先建立 journal_media 关系，正文才通得过校验
        int photoCount = 0;
        for (Moment moment : moments) {
            for (Long mediaId : momentService.photoIds(moment.getId())) {
                mediaService.attachExisting(journal.getId(), mediaId, null);
                photoCount++;
            }
        }

        ArrayNode blocks = objectMapper.createArrayNode();
        if (replace || isEmptyDocument(journal)) {
            blocks.add(dayOpener(trip, day, moments));
        } else {
            journal.getContentJson().path("blocks").forEach(blocks::add);
        }
        /*
         * 润色是叠在结构之上的一层，不是结构的一部分。
         * 拿不到改写结果（没配 key、网络不通、模型拒答）时这个映射是空的，
         * 下面就逐条用原文——整理照常完成，只是文字还是作者当时写的那句。
         */
        Map<Long, String> rewritten = useAi ? narrativeService.rewrite(moments) : Map.of();
        for (Moment moment : moments) appendMoment(blocks, moment, rewritten);

        ObjectNode document = objectMapper.createObjectNode();
        document.put("schemaVersion", 1);
        document.set("blocks", blocks);
        journal.setContentJson(document);
        journalService.updateDraft(journal.getId(), journal);
        int marked = momentService.markSorted(moments.stream().map(Moment::getId).toList(), journal.getId());
        if (marked != moments.size())
            throw BusinessException.conflict("随手记已被其他整理操作占用，请刷新后重试");
        return new ComposeResult(journal.getId(), moments.size(), photoCount, created, !rewritten.isEmpty());
    }

    /** 建一篇属于这一天的空草稿。标题给一个能改的默认值，作者通常会重写。 */
    private JournalEntry newDraft(Trip trip, LocalDate day) {
        JournalEntry draft = journalService.createDraft(trip.getId(), null, day);
        String city = cityOf(trip, day);
        draft.setTitle(StringUtils.hasText(city) ? city + " · " + day : String.valueOf(day));
        return draft;
    }

    private boolean isEmptyDocument(JournalEntry journal) {
        return journal.getContentJson() == null || journal.getContentJson().path("blocks").isEmpty();
    }

    /**
     * 开场卡。
     *
     * <p>路线取的是这一天随手记去过的地方去重后的顺序——这比行程表更贴近实际发生的事，
     * 计划里写了但没去成的地方不会出现在这里。</p>
     */
    private ObjectNode dayOpener(Trip trip, LocalDate day, List<Moment> moments) {
        ObjectNode block = block("day-opener");
        ObjectNode data = (ObjectNode) block.get("data");
        data.put("city", cityOf(trip, day));
        data.put("dayLabel", dayLabel(trip, day));
        data.put("date", day.toString());
        data.put("weather", "");
        ArrayNode route = data.putArray("route");
        placeNames(moments).forEach(route::add);
        ArrayNode metrics = data.putArray("metrics");
        ObjectNode count = metrics.addObject();
        count.put("value", String.valueOf(moments.size()));
        count.put("label", "条随手记");
        return block;
    }

    /** 这一天去过的地方，按先后顺序去重。 */
    private List<String> placeNames(List<Moment> moments) {
        Set<String> names = new LinkedHashSet<>();
        for (Moment moment : moments) {
            if (StringUtils.hasText(moment.getPlaceName())) names.add(moment.getPlaceName().trim());
        }
        return new ArrayList<>(names);
    }

    /**
     * 一条随手记展开成正文里的几个区块。
     *
     * <p>顺序固定是「章节 → 正文 → 照片」，因为那正是它被记下来的顺序：先到了某个时刻
     * 某个地方，然后说了一句话，最后拍了照片。</p>
     */
    private void appendMoment(ArrayNode blocks, Moment moment, Map<Long, String> rewritten) {
        String time = moment.getOccurredAt() == null ? ""
                : moment.getOccurredAt().atZoneSameInstant(occurrenceZone(moment)).format(HOUR_MINUTE);
        ObjectNode chapter = block("chapter");
        ObjectNode chapterData = (ObjectNode) chapter.get("data");
        chapterData.put("time", time);
        chapterData.put("title", StringUtils.hasText(moment.getPlaceName()) ? moment.getPlaceName() : "");
        chapterData.put("note", moment.getMood() == null ? "" : moment.getMood());
        // 时间和地点都没有的话这个章节只是一条空线，不如不放
        if (StringUtils.hasText(time) || StringUtils.hasText(moment.getPlaceName())) blocks.add(chapter);

        String text = rewritten.getOrDefault(moment.getId(), moment.getContent());
        if (StringUtils.hasText(text)) {
            ObjectNode paragraph = block("paragraph");
            ((ObjectNode) paragraph.get("data")).put("text", text);
            ((ObjectNode) paragraph.get("settings")).put("style", "normal");
            blocks.add(paragraph);
        }

        List<Long> photos = momentService.photoIds(moment.getId());
        if (photos.size() == 1) {
            /*
             * 单张用小图（约正文栏 42%）。
             *
             * 随手记一天可能十几条、每条一张照片，档位再大一点整篇就会被撑得很长——
             * 这是碎片记录，不是每张都值得占半屏。作者觉得某张该更大，在编辑器里
             * 单独调那一张就行。
             *
             * align 也要显式写上：figureClasses 虽然对缺失值有兜底，但正文里的区块
             * 应该是一份完整的设置，而不是靠渲染端补默认——否则以后改兜底值，
             * 已经整理好的日记会跟着变样。
             */
            ObjectNode image = block("image");
            ((ObjectNode) image.get("data")).put("mediaId", photos.get(0));
            ObjectNode settings = (ObjectNode) image.get("settings");
            settings.put("size", "small");
            settings.put("align", "center");
            blocks.add(image);
        } else if (photos.size() > 1) {
            ObjectNode gallery = block("gallery");
            ArrayNode ids = ((ObjectNode) gallery.get("data")).putArray("mediaIds");
            photos.forEach(ids::add);
            // 图组保持中等：几张并排本来就要靠宽度才排得开，再窄就每张都成邮票了
            ObjectNode settings = (ObjectNode) gallery.get("settings");
            settings.put("size", "medium");
            settings.put("align", "center");
            settings.put("layout", "grid");
            settings.put("columns", Math.min(3, photos.size()));
            blocks.add(gallery);
        }
    }

    /**
     * 造一个符合 Block 协议的空区块。
     *
     * <p>id 必须满足 {@code [A-Za-z0-9][A-Za-z0-9_-]{5,79}}，和前端 createBlock 生成的
     * 格式保持一致，否则 JournalDocumentService 会拒收。</p>
     */
    private ObjectNode block(String type) {
        ObjectNode node = objectMapper.createObjectNode();
        node.put("id", "block_" + Long.toString(System.nanoTime(), 36)
                + Integer.toString((int) (Math.random() * 1_000_000), 36));
        node.put("type", type);
        node.put("version", 1);
        node.put("title", "");
        node.putObject("data");
        node.putObject("settings");
        return node;
    }

    /** 这一天是这次旅行的第几天。旅行没填开始日期时不猜。 */
    private String dayLabel(Trip trip, LocalDate day) {
        if (trip.getStartDate() == null) return "";
        long diff = day.toEpochDay() - trip.getStartDate().toEpochDay();
        return diff >= 0 ? "Day " + (diff + 1) : "";
    }

    /** 这一天停在哪座城市。按行程里的到达/离开日期判断，判断不出来就用旅行标题。 */
    private String cityOf(Trip trip, LocalDate day) {
        List<TripStop> stops = stopMapper.selectList(new LambdaQueryWrapper<TripStop>()
                .eq(TripStop::getTripId, trip.getId()));
        return stops.stream()
                .filter(stop -> (stop.getArrivalDate() == null || !stop.getArrivalDate().isAfter(day))
                        && (stop.getDepartureDate() == null || !stop.getDepartureDate().isBefore(day)))
                .map(TripStop::getCityName).filter(StringUtils::hasText)
                .findFirst().orElse(trip.getTitle() == null ? "" : trip.getTitle());
    }

    private ZoneId occurrenceZone(Moment moment) {
        try { return ZoneId.of(moment.getOccurredZoneId()); }
        catch (Exception ignored) {
            try { return ZoneOffset.ofTotalSeconds(moment.getUtcOffsetMinutes() * 60); }
            catch (Exception fallback) { return clock.zone(); }
        }
    }
}
