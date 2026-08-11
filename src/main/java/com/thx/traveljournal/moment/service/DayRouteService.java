package com.thx.traveljournal.moment.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.thx.traveljournal.common.util.SiteClock;
import com.thx.traveljournal.itinerary.entity.ItineraryItem;
import com.thx.traveljournal.itinerary.mapper.ItineraryMapper;
import com.thx.traveljournal.journal.entity.JournalEntry;
import com.thx.traveljournal.media.service.MediaService;
import com.thx.traveljournal.moment.entity.Moment;
import com.thx.traveljournal.moment.entity.MomentMedia;
import com.thx.traveljournal.moment.mapper.MomentMapper;
import com.thx.traveljournal.moment.mapper.MomentMediaMapper;
import com.thx.traveljournal.trip.entity.TripStop;
import com.thx.traveljournal.trip.mapper.TripStopMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 一天的路线。
 *
 * <p>路线有两个来源，优先用随手记：随手记是「实际去过」，行程是「计划要去」。
 * 计划里写了但没去成的地方不应该出现在回放里——那会让整条路线变成一个不曾发生的故事。
 * 只有在这一天完全没有带坐标的随手记时，才回落到计划。</p>
 *
 * <p>这份数据同时给地图打点和「回放今天」用，所以每个点都带上时间、照片和当时写的那句话：
 * 回放的意义就是把人放回当时的现场，光有坐标是不够的。</p>
 */
@Service
@RequiredArgsConstructor
public class DayRouteService {
    private static final DateTimeFormatter HOUR_MINUTE = DateTimeFormatter.ofPattern("HH:mm");

    private final MomentMapper momentMapper;
    private final MomentMediaMapper momentMediaMapper;
    private final ItineraryMapper itineraryMapper;
    private final TripStopMapper stopMapper;
    private final MediaService mediaService;
    private final SiteClock clock;

    /**
     * 路线上的一个点。
     *
     * @param source moment 表示来自随手记（实际去过），plan 表示来自行程与城市（计划要去）
     */
    public record RoutePoint(int order, String time, String title, String note,
                             BigDecimal latitude, BigDecimal longitude,
                             List<Photo> photos, String source) {}

    /** 路线点上的照片。只给展示地址，不暴露原图。 */
    public record Photo(Long id, String thumbnailUrl, String displayUrl) {}

    /**
     * 某篇日记那一天的路线。
     *
     * <p>只取已经整理进这篇日记的随手记：没整理的还散着，属于作者的私人草稿，
     * 不该因为发布了日记就跟着公开。</p>
     */
    public List<RoutePoint> forJournal(JournalEntry journal) {
        if (journal == null) return List.of();
        List<Moment> moments = momentMapper.selectList(new LambdaQueryWrapper<Moment>()
                        .eq(Moment::getJournalEntryId, journal.getId()))
                .stream().filter(this::hasPosition)
                .sorted(Comparator.comparing(Moment::getOccurredAt)).toList();
        if (!moments.isEmpty()) return fromMoments(moments);
        return fromPlan(journal.getTripId(), journal.getOccurredOn());
    }

    /** 后台用：某次旅行某一天的路线，随手记不要求已经整理过。 */
    public List<RoutePoint> forDay(Long tripId, java.time.LocalDate day) {
        List<Moment> moments = momentMapper.selectList(new LambdaQueryWrapper<Moment>()
                        .eq(Moment::getTripId, tripId)
                        .eq(Moment::getOccurredLocalDate, day))
                .stream().filter(this::hasPosition)
                .sorted(Comparator.comparing(Moment::getOccurredAt)).toList();
        if (!moments.isEmpty()) return fromMoments(moments);
        return fromPlan(tripId, day);
    }

    private boolean hasPosition(Moment moment) {
        return moment.getLatitude() != null && moment.getLongitude() != null
                && moment.getOccurredAt() != null;
    }

    private List<RoutePoint> fromMoments(List<Moment> moments) {
        Map<Long, List<MomentMedia>> photos = momentMediaMapper.selectList(new LambdaQueryWrapper<MomentMedia>()
                        .in(MomentMedia::getMomentId, moments.stream().map(Moment::getId).toList())
                        .orderByAsc(MomentMedia::getSortOrder, MomentMedia::getId))
                .stream().collect(Collectors.groupingBy(MomentMedia::getMomentId));
        List<RoutePoint> points = new ArrayList<>();
        int order = 1;
        for (Moment moment : moments) {
            points.add(new RoutePoint(order++,
                    moment.getOccurredAt().atZoneSameInstant(occurrenceZone(moment)).format(HOUR_MINUTE),
                    StringUtils.hasText(moment.getPlaceName()) ? moment.getPlaceName() : "这里",
                    moment.getContent(), moment.getLatitude(), moment.getLongitude(),
                    photos.getOrDefault(moment.getId(), List.of()).stream()
                            .map(relation -> photo(relation.getMediaAssetId())).toList(),
                    "moment"));
        }
        return points;
    }

    /**
     * 没有随手记时的回落：按计划画一条线。
     *
     * <p>坐标只存在 {@code trip_stop} 上，行程条目自己没有经纬度，所以点是「这一天
     * 覆盖到的城市」，行程条目作为每个点上的说明。这条线比不上随手记那条真实——
     * 它是计划而不是发生过的事，所以 {@code source} 会标成 plan，前端可以据此
     * 换一种说法（「这一天的安排」而不是「回放今天」）。</p>
     */
    private List<RoutePoint> fromPlan(Long tripId, java.time.LocalDate day) {
        if (tripId == null || day == null) return List.of();
        List<TripStop> stops = stopMapper.selectList(new LambdaQueryWrapper<TripStop>()
                        .eq(TripStop::getTripId, tripId))
                .stream()
                .filter(stop -> stop.getLatitude() != null && stop.getLongitude() != null)
                .filter(stop -> (stop.getArrivalDate() == null || !stop.getArrivalDate().isAfter(day))
                        && (stop.getDepartureDate() == null || !stop.getDepartureDate().isBefore(day)))
                .sorted(Comparator.comparing(TripStop::getArrivalDate,
                        Comparator.nullsLast(Comparator.naturalOrder()))).toList();
        if (stops.isEmpty()) return List.of();
        // 当天的行程条目按城市归拢，作为每个点上的一行说明
        Map<Long, List<ItineraryItem>> plans = itineraryMapper.selectList(new LambdaQueryWrapper<ItineraryItem>()
                        .eq(ItineraryItem::getTripId, tripId).eq(ItineraryItem::getItemDate, day))
                .stream().filter(item -> item.getTripStopId() != null)
                .sorted(Comparator.comparing(ItineraryItem::getStartTime,
                        Comparator.nullsLast(Comparator.naturalOrder())))
                .collect(Collectors.groupingBy(ItineraryItem::getTripStopId));
        List<RoutePoint> points = new ArrayList<>();
        int order = 1;
        for (TripStop stop : stops) {
            List<ItineraryItem> items = plans.getOrDefault(stop.getId(), List.of());
            LocalTime start = items.isEmpty() ? null : items.get(0).getStartTime();
            String note = items.stream().map(ItineraryItem::getTitle)
                    .filter(StringUtils::hasText).collect(Collectors.joining(" · "));
            points.add(new RoutePoint(order++, start == null ? "" : start.format(HOUR_MINUTE),
                    stop.getCityName(), note, stop.getLatitude(), stop.getLongitude(),
                    List.of(), "plan"));
        }
        return points;
    }

    private Photo photo(Long mediaId) {
        MediaService.MediaView view = mediaService.viewOf(mediaId);
        return new Photo(view.id(), view.thumbnailUrl(), view.displayUrl());
    }

    private ZoneId occurrenceZone(Moment moment) {
        try { return ZoneId.of(moment.getOccurredZoneId()); }
        catch (Exception ignored) {
            try { return ZoneOffset.ofTotalSeconds(moment.getUtcOffsetMinutes() * 60); }
            catch (Exception fallback) { return clock.zone(); }
        }
    }
}
