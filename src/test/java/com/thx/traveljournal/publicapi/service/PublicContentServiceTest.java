package com.thx.traveljournal.publicapi.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.thx.traveljournal.journal.entity.JournalEntry;
import com.thx.traveljournal.journal.mapper.JournalMapper;
import com.thx.traveljournal.journal.service.JournalPreviewService;
import com.thx.traveljournal.media.mapper.JournalMediaMapper;
import com.thx.traveljournal.media.service.MediaService;
import com.thx.traveljournal.moment.service.DayRouteService;
import com.thx.traveljournal.publicapi.mapper.PublicAggregateMapper;
import com.thx.traveljournal.theme.service.ThemePresetService;
import com.thx.traveljournal.trip.entity.Trip;
import com.thx.traveljournal.trip.entity.TripStop;
import com.thx.traveljournal.trip.mapper.TripMapper;
import com.thx.traveljournal.trip.mapper.TripStopMapper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class PublicContentServiceTest {
    @BeforeAll
    static void initEntityMetadata() {
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), "");
        TableInfoHelper.initTableInfo(assistant, JournalEntry.class);
        TableInfoHelper.initTableInfo(assistant, Trip.class);
        TableInfoHelper.initTableInfo(assistant, TripStop.class);
    }

    @Test
    void 独立日记出现在首页但不计入旅行和城市() {
        TripMapper tripMapper = mock(TripMapper.class);
        TripStopMapper stopMapper = mock(TripStopMapper.class);
        JournalMapper journalMapper = mock(JournalMapper.class);
        PublicAggregateMapper aggregateMapper = mock(PublicAggregateMapper.class);
        JournalEntry journal = new JournalEntry();
        journal.setId(7L);
        journal.setTripId(null);
        journal.setTitle("成都雨夜");
        journal.setSlug("chengdu-rain");
        journal.setOccurredOn(LocalDate.of(2026, 8, 11));
        journal.setPublishedAt(OffsetDateTime.now());
        when(journalMapper.selectList(any())).thenReturn(List.of(journal));
        when(aggregateMapper.countPublishedPhotos()).thenReturn(0L);
        // 日记总数由 SQL 聚合回答，不再靠把全表读进内存后数一遍
        when(aggregateMapper.countPublishedJournals()).thenReturn(1L);

        PublicContentService service = new PublicContentService(tripMapper, stopMapper, journalMapper,
                mock(MediaService.class), mock(JournalMediaMapper.class), mock(ThemePresetService.class),
                aggregateMapper, mock(JournalPreviewService.class), mock(DayRouteService.class));

        PublicContentService.Home home = service.home();

        assertThat(home.journalCount()).isEqualTo(1);
        assertThat(home.tripCount()).isZero();
        assertThat(home.cityCount()).isZero();
        assertThat(home.recentJournals()).singleElement().satisfies(card -> {
            assertThat(card.title()).isEqualTo("成都雨夜");
            assertThat(card.tripTitle()).isNull();
            assertThat(card.tripSlug()).isNull();
        });
        verifyNoInteractions(tripMapper, stopMapper);
    }

    @Test
    void 日记列表按页批量取旅行和城市而不是逐篇查() {
        TripMapper tripMapper = mock(TripMapper.class);
        TripStopMapper stopMapper = mock(TripStopMapper.class);
        JournalMapper journalMapper = mock(JournalMapper.class);

        Trip trip = new Trip();
        trip.setId(3L);
        trip.setTitle("京都四日");
        trip.setSlug("kyoto");
        TripStop stop = new TripStop();
        stop.setId(5L);
        stop.setTripId(3L);
        stop.setCityName("京都");

        com.baomidou.mybatisplus.extension.plugins.pagination.Page<JournalEntry> page =
                new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>(1, 12);
        // 同一场旅行下的 12 篇日记：逐篇查的话，这一个 trip 会被来回查 12 次
        page.setRecords(java.util.stream.IntStream.rangeClosed(1, 12)
                .mapToObj(index -> {
                    JournalEntry entry = new JournalEntry();
                    entry.setId((long) index);
                    entry.setTripId(3L);
                    entry.setTripStopId(5L);
                    entry.setTitle("第 " + index + " 天");
                    entry.setSlug("day-" + index);
                    return entry;
                }).toList());
        page.setTotal(12);
        when(journalMapper.selectPage(any(), any())).thenReturn(page);
        when(tripMapper.selectByIds(any())).thenReturn(List.of(trip));
        when(stopMapper.selectByIds(any())).thenReturn(List.of(stop));

        PublicContentService service = new PublicContentService(tripMapper, stopMapper, journalMapper,
                mock(MediaService.class), mock(JournalMediaMapper.class), mock(ThemePresetService.class),
                mock(PublicAggregateMapper.class), mock(JournalPreviewService.class), mock(DayRouteService.class));

        var result = service.journals(1, 12, null, null);

        assertThat(result.items()).hasSize(12);
        assertThat(result.items().getFirst().tripTitle()).isEqualTo("京都四日");
        assertThat(result.items().getFirst().cityName()).isEqualTo("京都");
        // 一页日记只问一次旅行、一次城市，与这一页有多少篇无关
        verify(tripMapper, times(1)).selectByIds(any());
        verify(stopMapper, times(1)).selectByIds(any());
        verify(tripMapper, never()).selectById(any());
        verify(stopMapper, never()).selectById(any());
    }
}
