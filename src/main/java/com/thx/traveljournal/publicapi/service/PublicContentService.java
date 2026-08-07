package com.thx.traveljournal.publicapi.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.thx.traveljournal.common.api.PageResponse;
import com.thx.traveljournal.common.exception.BusinessException;
import com.thx.traveljournal.journal.entity.JournalEntry;
import com.thx.traveljournal.journal.mapper.JournalMapper;
import com.thx.traveljournal.journal.service.JournalPreviewService;
import com.thx.traveljournal.media.service.MediaService;
import com.thx.traveljournal.media.entity.JournalMedia;
import com.thx.traveljournal.media.mapper.JournalMediaMapper;
import com.thx.traveljournal.publicapi.mapper.PublicAggregateMapper;
import com.thx.traveljournal.trip.entity.Trip;
import com.thx.traveljournal.trip.entity.TripStop;
import com.thx.traveljournal.trip.mapper.TripMapper;
import com.thx.traveljournal.trip.mapper.TripStopMapper;
import com.thx.traveljournal.theme.service.ThemePresetService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 前台内容服务，把后台数据整理成访客能看到的形式。
 *
 * <p>这里是公开与非公开的分界线：所有查询都从「已发布的日记」出发往外扩，
 * 草稿以及只有草稿的旅行不会出现在任何前台接口里。</p>
 */
@Service
@RequiredArgsConstructor
public class PublicContentService {
    private final TripMapper tripMapper;
    private final TripStopMapper stopMapper;
    private final JournalMapper journalMapper;
    private final MediaService mediaService;
    private final JournalMediaMapper journalMediaMapper;
    private final ThemePresetService themePresetService;
    private final PublicAggregateMapper aggregateMapper;
    private final JournalPreviewService previewService;

    public record JournalCard(Long id, String title, String slug, String excerpt, LocalDate occurredOn,
                              String tripTitle, String tripSlug, String cityName, String coverUrl) {}
    public record TripCard(Long id, String title, String slug, String summary, String status,
                           LocalDate startDate, LocalDate endDate, List<String> cities,
                           long journalCount, String coverUrl) {}
    public record TripDetail(TripCard trip, List<TripStopView> stops, List<JournalCard> journals,
                             ThemePresetService.ThemeView theme) {}
    public record TripStopView(String cityName, String regionName, String countryName,
                               java.math.BigDecimal latitude, java.math.BigDecimal longitude,
                               String formattedAddress, String adcode, String coordinateSystem,
                               LocalDate arrivalDate, LocalDate departureDate, int sortOrder) {}
    public record JournalDetail(JournalCard journal, String contentMarkdown,
                                List<MediaService.MediaView> media, String previousSlug, String nextSlug,
                                ThemePresetService.ThemeView theme) {}
    public record CityMarker(String cityName, String regionName, String countryName,
                             String adcode, String coordinateSystem,
                             java.math.BigDecimal latitude,
                             java.math.BigDecimal longitude, LocalDate firstVisitedOn,
                             List<Integer> visitedYears, long tripCount, long publishedJournalCount,
                             List<TripLink> trips, List<JournalLink> journals) {}
    public record TripLink(String title, String slug) {}
    public record JournalLink(String title, String slug, String tripTitle, String tripSlug) {}
    public record Home(List<JournalCard> recentJournals, List<TripCard> recentTrips,
                       List<CityMarker> cityMarkers, long tripCount, long cityCount,
                       long journalCount, long photoCount) {}

    /** 首页数据：最近日记、最近旅行、地图城市点和四个统计数字。没有已发布日记时返回全空。 */
    public Home home() {
        List<JournalEntry> published = publishedJournals();
        if (published.isEmpty()) return new Home(List.of(), List.of(), List.of(), 0, 0, 0, 0);
        Set<Long> tripIds = published.stream().map(JournalEntry::getTripId).collect(Collectors.toSet());
        Map<Long, Trip> tripMap = tripMapper.selectByIds(tripIds).stream()
                .collect(Collectors.toMap(Trip::getId, Function.identity()));
        List<TripStop> allStops = stopMapper.selectList(new LambdaQueryWrapper<TripStop>()
                .in(TripStop::getTripId, tripIds).orderByAsc(TripStop::getSortOrder, TripStop::getId));
        Map<Long, TripStop> stopMap = allStops.stream().collect(Collectors.toMap(TripStop::getId, Function.identity()));
        Map<Long, List<TripStop>> stopsByTrip = allStops.stream().collect(Collectors.groupingBy(TripStop::getTripId));
        List<JournalCard> journals = published.stream().limit(6)
                .map(entry -> card(entry, tripMap.get(entry.getTripId()), stopMap.get(entry.getTripStopId()))).toList();
        Map<Long, Long> journalCounts = published.stream()
                .collect(Collectors.groupingBy(JournalEntry::getTripId, Collectors.counting()));
        List<TripCard> allTrips = tripMap.values().stream()
                .sorted(Comparator.comparing(Trip::getStartDate).reversed())
                .map(trip -> tripCard(trip, journalCounts.getOrDefault(trip.getId(), 0L),
                        stopsByTrip.getOrDefault(trip.getId(), List.of()))).toList();
        List<CityMarker> cities = mapCities(published, tripMap, allStops);
        // 照片数走 SQL 聚合。原先是把全部已发布日记的 id 拼进 in(...) 再 count，
        // 日记多了会拼出一条几百个参数的语句
        long photos = aggregateMapper.countPublishedPhotos();
        return new Home(journals, allTrips.stream().limit(3).toList(), cities,
                allTrips.size(), cities.size(), published.size(), photos);
    }

    /** 前台旅行列表。只展示至少有一篇已发布日记的旅行，草稿阶段的旅行不对外可见。 */
    public List<TripCard> publicTrips() {
        List<JournalEntry> published = publishedJournals();
        Map<Long, Long> counts = published.stream().collect(Collectors.groupingBy(JournalEntry::getTripId, Collectors.counting()));
        if (counts.isEmpty()) return List.of();
        return tripMapper.selectByIds(counts.keySet()).stream()
                .sorted(Comparator.comparing(Trip::getStartDate).reversed())
                .map(trip -> tripCard(trip, counts.getOrDefault(trip.getId(), 0L))).toList();
    }

    /** 旅行详情。一篇已发布日记都没有时按「尚未公开」处理，不泄露旅行的存在。 */
    public TripDetail trip(String slug) {
        Trip trip = tripMapper.selectOne(new LambdaQueryWrapper<Trip>().eq(Trip::getSlug, slug));
        if (trip == null) throw BusinessException.notFound("旅行不存在");
        List<JournalEntry> journals = journalMapper.selectList(new LambdaQueryWrapper<JournalEntry>()
                .eq(JournalEntry::getTripId, trip.getId()).eq(JournalEntry::getStatus, "PUBLISHED")
                .orderByDesc(JournalEntry::getOccurredOn));
        if (journals.isEmpty()) throw BusinessException.notFound("旅行尚未公开");
        List<TripStopView> stops = stopMapper.selectList(new LambdaQueryWrapper<TripStop>()
                        .eq(TripStop::getTripId, trip.getId()).orderByAsc(TripStop::getSortOrder))
                .stream().map(this::stopView).toList();
        return new TripDetail(tripCard(trip, journals.size()), stops, journals.stream().map(this::card).toList(),
                themePresetService.effective(null, trip.getThemeKey()));
    }

    /**
     * 前台日记列表，支持关键词搜索和标签筛选。
     *
     * <p>关键词走 {@code search_text} 生成列上的 ILIKE 子串匹配，配 pg_trgm 的 GIN 索引
     * （见 V8 迁移）。选子串匹配而不是 {@code to_tsvector} 分词，是因为默认分词器不认中文，
     * 「泡了温泉」会被当成一个整词，搜「温泉」反而匹配不到。</p>
     *
     * <p>关键词和标签都用参数占位符绑定，不做字符串拼接。</p>
     */
    public PageResponse<JournalCard> journals(long page, long pageSize, String keyword, String tagSlug) {
        LambdaQueryWrapper<JournalEntry> query = new LambdaQueryWrapper<JournalEntry>()
                .eq(JournalEntry::getStatus, "PUBLISHED");
        if (StringUtils.hasText(keyword)) {
            query.apply("search_text ilike {0}", "%" + keyword.trim() + "%");
        }
        if (StringUtils.hasText(tagSlug)) {
            // apply 的 {0} 会走参数绑定，和上面的关键词一样，不拼字符串
            query.apply("""
                    exists (select 1 from journal_tag_relation r
                              join journal_tag t on t.id = r.journal_tag_id
                             where r.journal_entry_id = journal_entry.id and t.slug = {0})
                    """, tagSlug.trim());
        }
        Page<JournalEntry> result = journalMapper.selectPage(Page.of(page, pageSize),
                query.orderByDesc(JournalEntry::getPublishedAt));
        return PageResponse.of(result.getRecords().stream().map(this::card).toList(),
                page, pageSize, result.getTotal());
    }

    public JournalDetail journal(String slug) {
        JournalEntry entry = journalMapper.selectOne(new LambdaQueryWrapper<JournalEntry>()
                .eq(JournalEntry::getSlug, slug).eq(JournalEntry::getStatus, "PUBLISHED"));
        if (entry == null) throw BusinessException.notFound("日记不存在");
        List<JournalEntry> tripJournals = journalMapper.selectList(new LambdaQueryWrapper<JournalEntry>()
                .eq(JournalEntry::getTripId, entry.getTripId()).eq(JournalEntry::getStatus, "PUBLISHED")
                .orderByAsc(JournalEntry::getOccurredOn, JournalEntry::getId));
        int index = java.util.stream.IntStream.range(0, tripJournals.size())
                .filter(i -> tripJournals.get(i).getId().equals(entry.getId())).findFirst().orElse(-1);
        String previous = index > 0 ? tripJournals.get(index - 1).getSlug() : null;
        String next = index >= 0 && index < tripJournals.size() - 1 ? tripJournals.get(index + 1).getSlug() : null;
        Trip trip = tripMapper.selectById(entry.getTripId());
        TripStop stop = entry.getTripStopId() == null ? null : stopMapper.selectById(entry.getTripStopId());
        return new JournalDetail(card(entry, trip, stop), entry.getContentMarkdown(), mediaService.list(entry.getId()),
                previous, next, themePresetService.effective(entry.getThemeKey(), trip.getThemeKey()));
    }

    /**
     * 按预览令牌取日记，用于草稿预览。
     *
     * <p>和正式详情页共用同一套渲染数据，这样预览看到的就是发布后的真实样子。
     * 差别是不提供上一篇/下一篇——草稿不在任何序列里。</p>
     */
    public JournalDetail previewByToken(String token) {
        JournalEntry entry = previewService.resolve(token);
        Trip trip = tripMapper.selectById(entry.getTripId());
        TripStop stop = entry.getTripStopId() == null ? null : stopMapper.selectById(entry.getTripStopId());
        return new JournalDetail(card(entry, trip, stop), entry.getContentMarkdown(),
                mediaService.list(entry.getId()), null, null,
                themePresetService.effective(entry.getThemeKey(), trip == null ? null : trip.getThemeKey()));
    }

    public List<CityMarker> mapCities() {
        List<JournalEntry> published = publishedJournals();
        Map<Long, JournalEntry> byTrip = published.stream().collect(Collectors.toMap(
                JournalEntry::getTripId, Function.identity(), (a, b) -> a));
        if (byTrip.isEmpty()) return List.of();
        Map<Long, Trip> trips = tripMapper.selectByIds(byTrip.keySet()).stream()
                .collect(Collectors.toMap(Trip::getId, Function.identity()));
        List<TripStop> stops = stopMapper.selectList(new LambdaQueryWrapper<TripStop>()
                .in(TripStop::getTripId, byTrip.keySet()).orderByAsc(TripStop::getArrivalDate));
        return mapCities(published, trips, stops);
    }

    private List<CityMarker> mapCities(List<JournalEntry> published, Map<Long, Trip> trips,
                                       List<TripStop> stops) {
        Map<String, List<TripStop>> grouped = stops.stream().collect(Collectors.groupingBy(
                stop -> stop.getCountryName() + "|" + (StringUtils.hasText(stop.getAdcode()) ? stop.getAdcode() : stop.getCityName()),
                LinkedHashMap::new, Collectors.toList()));
        List<CityMarker> result = new ArrayList<>();
        for (List<TripStop> cityStops : grouped.values()) {
            TripStop first = cityStops.get(0);
            Set<Long> tripIds = cityStops.stream().map(TripStop::getTripId).collect(Collectors.toSet());
            List<JournalEntry> cityJournals = published.stream()
                    .filter(j -> tripIds.contains(j.getTripId()))
                    .filter(j -> j.getTripStopId() != null && cityStops.stream().anyMatch(s -> s.getId().equals(j.getTripStopId())))
                    .toList();
            List<TripLink> tripLinks = tripIds.stream().map(trips::get).filter(Objects::nonNull)
                    .sorted(Comparator.comparing(Trip::getStartDate).reversed())
                    .map(t -> new TripLink(t.getTitle(), t.getSlug())).toList();
            List<JournalLink> links = cityJournals.stream().map(j -> {
                Trip trip = trips.get(j.getTripId());
                return new JournalLink(j.getTitle(), j.getSlug(), trip.getTitle(), trip.getSlug());
            }).toList();
            LocalDate firstDate = cityStops.stream().map(TripStop::getArrivalDate).filter(Objects::nonNull)
                    .min(LocalDate::compareTo).orElse(null);
            List<Integer> years = cityStops.stream().map(TripStop::getArrivalDate).filter(Objects::nonNull)
                    .map(LocalDate::getYear).distinct().sorted().toList();
            result.add(new CityMarker(first.getCityName(), first.getRegionName(), first.getCountryName(),
                    first.getAdcode(), first.getCoordinateSystem(), first.getLatitude(), first.getLongitude(),
                    firstDate, years, tripIds.size(), cityJournals.size(), tripLinks, links));
        }
        return result;
    }

    /** 所有已发布日记，按发生日期倒序。前台的一切内容都从这个集合派生。 */
    /**
     * 已发布日记的轻量投影，按发布时间倒序。
     *
     * <p>刻意不查 {@code content_markdown} 和两个模板 jsonb 字段：首页、旅行列表和地图
     * 都只需要标题、日期和归属，正文一个字都用不到。不做这个投影的话，每渲染一次首页
     * 就要把全站正文读一遍，日记攒到几百篇会非常明显。</p>
     *
     * <p>需要正文的地方（日记详情）另外按 slug 单查一条完整记录。</p>
     */
    private List<JournalEntry> publishedJournals() {
        return journalMapper.selectList(new LambdaQueryWrapper<JournalEntry>()
                .select(JournalEntry::getId, JournalEntry::getTripId, JournalEntry::getTripStopId,
                        JournalEntry::getTitle, JournalEntry::getSlug, JournalEntry::getExcerpt,
                        JournalEntry::getOccurredOn, JournalEntry::getCoverMediaId,
                        JournalEntry::getStatus, JournalEntry::getPublishedAt, JournalEntry::getThemeKey)
                .eq(JournalEntry::getStatus, "PUBLISHED").orderByDesc(JournalEntry::getPublishedAt));
    }

    private JournalCard card(JournalEntry entry) {
        Trip trip = tripMapper.selectById(entry.getTripId());
        TripStop stop = entry.getTripStopId() == null ? null : stopMapper.selectById(entry.getTripStopId());
        return card(entry, trip, stop);
    }

    private JournalCard card(JournalEntry entry, Trip trip, TripStop stop) {
        return new JournalCard(entry.getId(), entry.getTitle(), entry.getSlug(), entry.getExcerpt(),
                entry.getOccurredOn(), trip.getTitle(), trip.getSlug(),
                stop == null ? null : stop.getCityName(), mediaUrl(entry.getCoverMediaId(), "display"));
    }

    private TripCard tripCard(Trip trip, long journalCount) {
        List<TripStop> stops = stopMapper.selectList(new LambdaQueryWrapper<TripStop>()
                .eq(TripStop::getTripId, trip.getId()).orderByAsc(TripStop::getSortOrder));
        return tripCard(trip, journalCount, stops);
    }

    private TripCard tripCard(Trip trip, long journalCount, List<TripStop> stops) {
        List<String> cities = stops.stream().map(TripStop::getCityName).toList();
        return new TripCard(trip.getId(), trip.getTitle(), trip.getSlug(), trip.getSummary(), trip.getStatus(),
                trip.getStartDate(), trip.getEndDate(), cities, journalCount, mediaUrl(trip.getCoverMediaId(), "display"));
    }

    private TripStopView stopView(TripStop stop) {
        return new TripStopView(stop.getCityName(), stop.getRegionName(), stop.getCountryName(),
                stop.getLatitude(), stop.getLongitude(), stop.getFormattedAddress(), stop.getAdcode(),
                stop.getCoordinateSystem(), stop.getArrivalDate(), stop.getDepartureDate(),
                stop.getSortOrder() == null ? 0 : stop.getSortOrder());
    }

    /** 拼图片的站内地址，实际访问时再由 MediaService 换成对象存储的预签名地址。 */
    private String mediaUrl(Long mediaId, String variant) {
        return mediaId == null ? null : "/api/media/" + mediaId + "/" + variant;
    }
}
