package com.thx.traveljournal.publicapi.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.thx.traveljournal.common.api.PageResponse;
import com.thx.traveljournal.common.exception.BusinessException;
import com.thx.traveljournal.journal.entity.JournalEntry;
import com.thx.traveljournal.journal.mapper.JournalMapper;
import com.thx.traveljournal.media.service.MediaService;
import com.thx.traveljournal.trip.entity.Trip;
import com.thx.traveljournal.trip.entity.TripStop;
import com.thx.traveljournal.trip.mapper.TripMapper;
import com.thx.traveljournal.trip.mapper.TripStopMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class PublicContentService {
    private final TripMapper tripMapper;
    private final TripStopMapper stopMapper;
    private final JournalMapper journalMapper;
    private final MediaService mediaService;

    public record JournalCard(Long id, String title, String slug, String excerpt, LocalDate occurredOn,
                              String tripTitle, String tripSlug, String cityName, String coverUrl) {}
    public record TripCard(Long id, String title, String slug, String summary, String status,
                           LocalDate startDate, LocalDate endDate, List<String> cities,
                           long journalCount, String coverUrl) {}
    public record TripDetail(TripCard trip, List<TripStopView> stops, List<JournalCard> journals) {}
    public record TripStopView(String cityName, String regionName, String countryName,
                               java.math.BigDecimal latitude, java.math.BigDecimal longitude,
                               LocalDate arrivalDate, LocalDate departureDate, int sortOrder) {}
    public record JournalDetail(JournalCard journal, String contentMarkdown,
                                List<MediaService.MediaView> media, String previousSlug, String nextSlug) {}
    public record CityMarker(String cityName, String countryName, java.math.BigDecimal latitude,
                             java.math.BigDecimal longitude, LocalDate firstVisitedOn,
                             long tripCount, long publishedJournalCount, List<JournalLink> journals) {}
    public record JournalLink(String title, String slug, String tripTitle, String tripSlug) {}
    public record Home(List<JournalCard> recentJournals, List<TripCard> recentTrips,
                       long tripCount, long cityCount, long journalCount, long photoCount) {}

    public Home home() {
        List<JournalEntry> published = publishedJournals();
        List<JournalCard> journals = published.stream().limit(6).map(this::card).toList();
        List<TripCard> allTrips = publicTrips();
        List<TripCard> trips = allTrips.stream().limit(3).toList();
        long photos = published.stream().mapToLong(j -> mediaService.list(j.getId()).size()).sum();
        long cityCount = mapCities().size();
        return new Home(journals, trips, allTrips.size(), cityCount, published.size(), photos);
    }

    public List<TripCard> publicTrips() {
        List<JournalEntry> published = publishedJournals();
        Map<Long, Long> counts = published.stream().collect(Collectors.groupingBy(JournalEntry::getTripId, Collectors.counting()));
        if (counts.isEmpty()) return List.of();
        return tripMapper.selectByIds(counts.keySet()).stream()
                .sorted(Comparator.comparing(Trip::getStartDate).reversed())
                .map(trip -> tripCard(trip, counts.getOrDefault(trip.getId(), 0L))).toList();
    }

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
        return new TripDetail(tripCard(trip, journals.size()), stops, journals.stream().map(this::card).toList());
    }

    public PageResponse<JournalCard> journals(long page, long pageSize) {
        Page<JournalEntry> result = journalMapper.selectPage(Page.of(page, pageSize),
                new LambdaQueryWrapper<JournalEntry>().eq(JournalEntry::getStatus, "PUBLISHED")
                        .orderByDesc(JournalEntry::getPublishedAt));
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
        return new JournalDetail(card(entry), entry.getContentMarkdown(), mediaService.list(entry.getId()), previous, next);
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
        Map<String, List<TripStop>> grouped = stops.stream().collect(Collectors.groupingBy(
                stop -> stop.getCountryName() + "|" + stop.getCityName(), LinkedHashMap::new, Collectors.toList()));
        List<CityMarker> result = new ArrayList<>();
        for (List<TripStop> cityStops : grouped.values()) {
            TripStop first = cityStops.get(0);
            Set<Long> tripIds = cityStops.stream().map(TripStop::getTripId).collect(Collectors.toSet());
            List<JournalEntry> cityJournals = published.stream()
                    .filter(j -> tripIds.contains(j.getTripId()))
                    .filter(j -> j.getTripStopId() == null || cityStops.stream().anyMatch(s -> s.getId().equals(j.getTripStopId())))
                    .toList();
            List<JournalLink> links = cityJournals.stream().map(j -> {
                Trip trip = trips.get(j.getTripId());
                return new JournalLink(j.getTitle(), j.getSlug(), trip.getTitle(), trip.getSlug());
            }).toList();
            LocalDate firstDate = cityStops.stream().map(TripStop::getArrivalDate).filter(Objects::nonNull)
                    .min(LocalDate::compareTo).orElse(null);
            result.add(new CityMarker(first.getCityName(), first.getCountryName(), first.getLatitude(),
                    first.getLongitude(), firstDate, tripIds.size(), cityJournals.size(), links));
        }
        return result;
    }

    private List<JournalEntry> publishedJournals() {
        return journalMapper.selectList(new LambdaQueryWrapper<JournalEntry>()
                .eq(JournalEntry::getStatus, "PUBLISHED").orderByDesc(JournalEntry::getPublishedAt));
    }

    private JournalCard card(JournalEntry entry) {
        Trip trip = tripMapper.selectById(entry.getTripId());
        TripStop stop = entry.getTripStopId() == null ? null : stopMapper.selectById(entry.getTripStopId());
        return new JournalCard(entry.getId(), entry.getTitle(), entry.getSlug(), entry.getExcerpt(),
                entry.getOccurredOn(), trip.getTitle(), trip.getSlug(),
                stop == null ? null : stop.getCityName(), mediaUrl(entry.getCoverMediaId(), "display"));
    }

    private TripCard tripCard(Trip trip, long journalCount) {
        List<String> cities = stopMapper.selectList(new LambdaQueryWrapper<TripStop>()
                        .eq(TripStop::getTripId, trip.getId()).orderByAsc(TripStop::getSortOrder))
                .stream().map(TripStop::getCityName).toList();
        return new TripCard(trip.getId(), trip.getTitle(), trip.getSlug(), trip.getSummary(), trip.getStatus(),
                trip.getStartDate(), trip.getEndDate(), cities, journalCount, mediaUrl(trip.getCoverMediaId(), "display"));
    }

    private TripStopView stopView(TripStop stop) {
        return new TripStopView(stop.getCityName(), stop.getRegionName(), stop.getCountryName(),
                stop.getLatitude(), stop.getLongitude(), stop.getArrivalDate(), stop.getDepartureDate(),
                stop.getSortOrder() == null ? 0 : stop.getSortOrder());
    }

    private String mediaUrl(Long mediaId, String variant) {
        return mediaId == null ? null : "/api/media/" + mediaId + "/" + variant;
    }
}
