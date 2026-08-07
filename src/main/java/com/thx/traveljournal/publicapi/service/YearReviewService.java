package com.thx.traveljournal.publicapi.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.thx.traveljournal.journal.entity.JournalEntry;
import com.thx.traveljournal.journal.mapper.JournalMapper;
import com.thx.traveljournal.trip.entity.Trip;
import com.thx.traveljournal.trip.entity.TripStop;
import com.thx.traveljournal.trip.mapper.TripMapper;
import com.thx.traveljournal.trip.mapper.TripStopMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 年度回顾：把一年的旅行数据聚合成几个能一眼看懂的数字。
 *
 * <p>数据全部来自已有的旅行、城市和日记，不需要新表。距离用 Haversine 公式在应用侧算，
 * 不引 PostGIS（开发规范里明确排除了）。</p>
 *
 * <p>口径说明：只统计有已发布日记的旅行——年度回顾是给访客看的页面，
 * 还没写完的旅行不该出现在里面。</p>
 */
@Service
@RequiredArgsConstructor
public class YearReviewService {
    /** 地球平均半径，公里 */
    private static final double EARTH_RADIUS_KM = 6371.0088;

    private final TripMapper tripMapper;
    private final TripStopMapper stopMapper;
    private final JournalMapper journalMapper;
    private final com.thx.traveljournal.media.mapper.JournalMediaMapper journalMediaMapper;

    public record CityVisit(String cityName, String countryName, LocalDate arrivalDate) {}
    public record TripSummary(String title, String slug, LocalDate startDate, LocalDate endDate,
                              int cityCount, long journalCount) {}
    public record YearReview(int year, long tripCount, long cityCount, long countryCount,
                             long journalCount, long photoCount, long distanceKm,
                             List<CityVisit> cities, List<TripSummary> trips,
                             String farthestCity, long longestTripDays) {}

    /** 有已发布日记的年份，倒序，供前端做年份切换。 */
    public List<Integer> availableYears() {
        return journalMapper.selectList(new LambdaQueryWrapper<JournalEntry>()
                        .select(JournalEntry::getOccurredOn)
                        .eq(JournalEntry::getStatus, "PUBLISHED"))
                .stream().map(entry -> entry.getOccurredOn().getYear())
                .distinct().sorted(Comparator.reverseOrder()).toList();
    }

    /**
     * 生成某一年的回顾。
     *
     * <p>年份归属按日记的发生日期算，不按发布日期——跨年补写的日记应该算在旅行发生的那一年。</p>
     */
    public YearReview review(int year) {
        List<JournalEntry> journals = journalMapper.selectList(new LambdaQueryWrapper<JournalEntry>()
                .select(JournalEntry::getId, JournalEntry::getTripId, JournalEntry::getOccurredOn)
                .eq(JournalEntry::getStatus, "PUBLISHED")
                .apply("extract(year from occurred_on) = {0}", year));
        if (journals.isEmpty()) {
            return new YearReview(year, 0, 0, 0, 0, 0, 0, List.of(), List.of(), null, 0);
        }

        Set<Long> tripIds = journals.stream().map(JournalEntry::getTripId).collect(Collectors.toSet());
        Map<Long, Trip> trips = tripMapper.selectByIds(tripIds).stream()
                .collect(Collectors.toMap(Trip::getId, Function.identity()));
        List<TripStop> stops = stopMapper.selectList(new LambdaQueryWrapper<TripStop>()
                .in(TripStop::getTripId, tripIds).orderByAsc(TripStop::getTripId, TripStop::getSortOrder));
        Map<Long, List<TripStop>> stopsByTrip = stops.stream().collect(Collectors.groupingBy(TripStop::getTripId));
        Map<Long, Long> journalsByTrip = journals.stream()
                .collect(Collectors.groupingBy(JournalEntry::getTripId, Collectors.counting()));

        // 距离：每次旅行内部按停靠顺序累加相邻城市间的大圆距离。
        // 不跨旅行连线——两次独立旅行之间的往返不属于「这次走过的路」。
        long distance = Math.round(stopsByTrip.values().stream()
                .mapToDouble(this::routeDistance).sum());

        List<CityVisit> cityVisits = stops.stream()
                .map(stop -> new CityVisit(stop.getCityName(), stop.getCountryName(), stop.getArrivalDate()))
                .toList();
        long cityCount = stops.stream().map(TripStop::getCityName).filter(Objects::nonNull).distinct().count();
        long countryCount = stops.stream().map(TripStop::getCountryName).filter(Objects::nonNull).distinct().count();

        List<TripSummary> tripSummaries = trips.values().stream()
                .sorted(Comparator.comparing(Trip::getStartDate))
                .map(trip -> new TripSummary(trip.getTitle(), trip.getSlug(), trip.getStartDate(), trip.getEndDate(),
                        stopsByTrip.getOrDefault(trip.getId(), List.of()).size(),
                        journalsByTrip.getOrDefault(trip.getId(), 0L)))
                .toList();

        long photos = journalMediaMapper.selectCount(new LambdaQueryWrapper<com.thx.traveljournal.media.entity.JournalMedia>()
                .in(com.thx.traveljournal.media.entity.JournalMedia::getJournalEntryId,
                        journals.stream().map(JournalEntry::getId).toList()));

        long longestDays = trips.values().stream()
                .mapToLong(trip -> java.time.temporal.ChronoUnit.DAYS.between(trip.getStartDate(), trip.getEndDate()) + 1)
                .max().orElse(0);

        return new YearReview(year, trips.size(), cityCount, countryCount, journals.size(), photos, distance,
                cityVisits, tripSummaries, farthestCity(stops), longestDays);
    }

    /** 一次旅行内部，按停靠顺序累加相邻城市之间的距离。 */
    private double routeDistance(List<TripStop> tripStops) {
        double total = 0;
        for (int i = 1; i < tripStops.size(); i++) {
            total += haversine(tripStops.get(i - 1), tripStops.get(i));
        }
        return total;
    }

    /**
     * 离出发地最远的城市。
     *
     * <p>「出发地」取当年第一次旅行的第一个停靠点——个人旅行通常从家出发，
     * 这个近似足够表达「今年走得最远的地方」。</p>
     */
    private String farthestCity(List<TripStop> stops) {
        if (stops.size() < 2) return null;
        TripStop origin = stops.get(0);
        return stops.stream().skip(1)
                .max(Comparator.comparingDouble(stop -> haversine(origin, stop)))
                .map(TripStop::getCityName).orElse(null);
    }

    /**
     * Haversine 大圆距离，公里。
     *
     * <p>误差在 0.5% 以内，对「今年走了多少公里」这种展示型数字完全够用，
     * 也省掉引入 PostGIS 的成本。</p>
     */
    private double haversine(TripStop a, TripStop b) {
        Double lat1 = toDouble(a.getLatitude()), lon1 = toDouble(a.getLongitude());
        Double lat2 = toDouble(b.getLatitude()), lon2 = toDouble(b.getLongitude());
        if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return 0;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double h = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
    }

    private Double toDouble(BigDecimal value) { return value == null ? null : value.doubleValue(); }
}
