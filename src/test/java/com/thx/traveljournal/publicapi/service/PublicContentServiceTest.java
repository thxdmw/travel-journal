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
}
