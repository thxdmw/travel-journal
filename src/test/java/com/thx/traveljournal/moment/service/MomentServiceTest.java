package com.thx.traveljournal.moment.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.thx.traveljournal.common.util.SiteClock;
import com.thx.traveljournal.media.service.MediaService;
import com.thx.traveljournal.moment.entity.Moment;
import com.thx.traveljournal.moment.entity.MomentMedia;
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
    private MomentMediaMapper mediaMapper;
    private MediaService mediaService;
    private TripMapper tripMapper;
    private MomentService service;

    @BeforeEach
    void setUp() {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "moment-test"),
                Moment.class);
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "moment-media-test"),
                MomentMedia.class);
        mapper = mock(MomentMapper.class);
        mediaMapper = mock(MomentMediaMapper.class);
        mediaService = mock(MediaService.class);
        tripMapper = mock(TripMapper.class);
        MomentService[] self = new MomentService[1];
        service = new MomentService(mapper, mediaMapper, tripMapper,
                mock(TripStopMapper.class), mediaService, new SiteClock(null),
                com.thx.traveljournal.support.SelfProvider.of(self));
        self[0] = service;
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
    void locatedMomentAlwaysStoresWgs84Metadata() {
        when(mapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(null);
        Moment input = new Moment();
        input.setTripId(7L);
        input.setOccurredAt(OffsetDateTime.parse("2026-08-11T15:30:00Z"));
        input.setLatitude(java.math.BigDecimal.valueOf(30.6598));
        input.setLongitude(java.math.BigDecimal.valueOf(104.0633));

        Moment created = service.create(input);

        assertThat(created.getCoordinateSystem()).isEqualTo("WGS84");
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

    /*
     * ============================================================ 随手记照片
     *
     * 和 journal_media 一模一样的两个坑：序号用条数分配会撞车，以及行锁少一条路径
     * 就有并发窗口。日记那边已经踩过一遍，这里不该再踩第二遍。
     */

    private MediaService.PreparedImage prepared() {
        com.thx.traveljournal.media.entity.MediaAsset asset = new com.thx.traveljournal.media.entity.MediaAsset();
        asset.setId(77L);
        return new MediaService.PreparedImage(asset, "travel-journal", "k1", "k2");
    }

    private MomentMedia photo(long id, long assetId, int sortOrder) {
        MomentMedia relation = new MomentMedia();
        relation.setId(id);
        relation.setMomentId(42L);
        relation.setMediaAssetId(assetId);
        relation.setSortOrder(sortOrder);
        return relation;
    }

    private void momentExists() {
        Moment moment = new Moment();
        moment.setId(42L);
        moment.setTripId(7L);
        when(mapper.selectById(42L)).thenReturn(moment);
        when(mapper.lockMoment(42L)).thenReturn(42L);
    }

    @Test
    void photoSortOrderSkipsGapsLeftByDeletion() {
        momentExists();
        // [0,1,2] 里删掉中间那张，剩下 [0,2]：条数是 2，最大序号也是 2
        when(mediaMapper.selectList(any(LambdaQueryWrapper.class)))
                .thenReturn(List.of(photo(1L, 11L, 0), photo(3L, 13L, 2)));
        when(mediaService.persistLoose(any())).thenReturn(new MediaService.MediaView(
                null, 77L, "a.jpg", "image/webp", 1, 1, null, null, "t", "m", "d", null, null, null));

        service.persistMomentPhoto(42L, null, prepared());

        var inserted = org.mockito.ArgumentCaptor.forClass(MomentMedia.class);
        verify(mediaMapper).insert(inserted.capture());
        // 用条数会得到 2，和现有那张撞车；必须是 max+1
        assertThat(inserted.getValue().getSortOrder()).isEqualTo(3);
    }

    @Test
    void replayedOfflineUploadReturnsTheFirstPhotoAndDiscardsTheNewFile() {
        momentExists();
        when(mediaMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(photo(9L, 11L, 0));

        MediaService.PreparedImage prepared = prepared();
        service.persistMomentPhoto(42L, "photo_abc", prepared);

        verify(mediaMapper, never()).insert(any(MomentMedia.class));
        // 阶段 A 已经把文件传上去了，重放时必须删掉，不然桶里留下一份没人引用的
        verify(mediaService).discardPrepared(prepared);
        verify(mediaService).viewOf(11L);
    }

    @Test
    void removingAndDeletingBothTakeTheMomentLock() {
        momentExists();
        when(mediaMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(photo(9L, 11L, 0)));

        service.removePhoto(42L, 11L);
        service.delete(42L);

        // 加照片、撤照片、删随手记必须共用同一把锁，否则三者之间都有并发窗口
        verify(mapper, times(2)).lockMoment(42L);
    }
}
