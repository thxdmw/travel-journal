package com.thx.traveljournal.moment.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.thx.traveljournal.common.util.SiteClock;
import com.thx.traveljournal.media.service.MediaService;
import com.thx.traveljournal.moment.entity.Moment;
import com.thx.traveljournal.moment.mapper.MomentMapper;
import com.thx.traveljournal.moment.mapper.MomentMediaMapper;
import com.thx.traveljournal.trip.entity.Trip;
import com.thx.traveljournal.trip.mapper.TripMapper;
import com.thx.traveljournal.trip.mapper.TripStopMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.apache.ibatis.builder.MapperBuilderAssistant;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class MomentServiceTest {
    private MomentMapper mapper;
    private TripMapper tripMapper;
    private MomentService service;

    @BeforeEach
    void setUp() {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "moment-test"),
                Moment.class);
        mapper = mock(MomentMapper.class);
        tripMapper = mock(TripMapper.class);
        service = new MomentService(mapper, mock(MomentMediaMapper.class), tripMapper,
                mock(TripStopMapper.class), mock(MediaService.class), new SiteClock(null));
        Trip trip = new Trip();
        trip.setId(7L);
        when(tripMapper.selectById(7L)).thenReturn(trip);
    }

    @Test
    void sameClientIdShouldReturnExistingMomentWithoutDuplicateInsert() {
        Moment existing = new Moment();
        existing.setId(42L);
        existing.setTripId(7L);
        existing.setClientId("moment_abc");
        when(mapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(existing);

        Moment input = new Moment();
        input.setTripId(7L);
        input.setClientId(" moment_abc ");

        assertThat(service.create(input)).isSameAs(existing);
        verify(mapper).lockTrip(7L);
        verify(mapper, never()).insert(any(Moment.class));
    }

    @Test
    void occurrenceShouldKeepInstantAndUseWhereItHappenedForLocalDate() {
        when(mapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(null);
        Moment input = new Moment();
        input.setTripId(7L);
        input.setClientId("moment_tokyo");
        input.setOccurredAt(OffsetDateTime.parse("2026-08-11T15:30:00Z"));
        input.setOccurredZoneId("Asia/Tokyo");
        input.setUtcOffsetMinutes(0); // 客户端偏移即使不一致，也以有效 IANA 时区为准
        input.setContent("  夜里的河岸  ");

        Moment created = service.create(input);

        assertThat(created.getOccurredAt()).isEqualTo(OffsetDateTime.parse("2026-08-11T15:30:00Z"));
        assertThat(created.getOccurredLocalDate()).isEqualTo(LocalDate.of(2026, 8, 12));
        assertThat(created.getOccurredZoneId()).isEqualTo("Asia/Tokyo");
        assertThat(created.getUtcOffsetMinutes()).isEqualTo(540);
        assertThat(created.getContent()).isEqualTo("夜里的河岸");
        verify(mapper).insert(created);
    }

    @Test
    void composeSelectionShouldExcludeMomentsOwnedByAnotherJournal() {
        when(mapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of());

        service.forCompose(7L, LocalDate.of(2026, 8, 11), 99L, true);

        @SuppressWarnings("unchecked")
        var query = (LambdaQueryWrapper<Moment>) mockingDetails(mapper).getInvocations().stream()
                .filter(invocation -> invocation.getMethod().getName().equals("selectList"))
                .findFirst().orElseThrow().getArgument(0);
        String sql = query.getCustomSqlSegment().toLowerCase();
        assertThat(sql).contains("journal_entry_id is null");
        assertThat(sql).contains("journal_entry_id =");
        assertThat(sql).contains("for update");
    }
}
