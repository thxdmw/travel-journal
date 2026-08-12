package com.thx.traveljournal.publicapi.service;

import com.thx.traveljournal.journal.entity.JournalEntry;
import com.thx.traveljournal.journal.mapper.JournalMapper;
import com.thx.traveljournal.media.mapper.JournalMediaMapper;
import com.thx.traveljournal.trip.entity.Trip;
import com.thx.traveljournal.trip.entity.TripStop;
import com.thx.traveljournal.trip.mapper.TripMapper;
import com.thx.traveljournal.trip.mapper.TripStopMapper;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class YearReviewServiceTest {
    private JournalMapper journalMapper;
    private TripMapper tripMapper;
    private TripStopMapper stopMapper;
    private YearReviewService service;

    /**
     * LambdaQueryWrapper 的 {@code select(Entity::getX)} 在构造时就要把方法引用解析成列名，
     * 依赖 MyBatis-Plus 的实体元信息缓存。真实运行时框架启动会扫描并填好这份缓存，
     * 纯单元测试没有这个上下文，所以在这里手工注册一次。
     */
    @BeforeAll
    static void initEntityMetadata() {
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), "");
        TableInfoHelper.initTableInfo(assistant, JournalEntry.class);
        TableInfoHelper.initTableInfo(assistant, Trip.class);
        TableInfoHelper.initTableInfo(assistant, TripStop.class);
        TableInfoHelper.initTableInfo(assistant, com.thx.traveljournal.media.entity.JournalMedia.class);
    }

    @BeforeEach
    void setUp() {
        journalMapper = mock(JournalMapper.class);
        tripMapper = mock(TripMapper.class);
        stopMapper = mock(TripStopMapper.class);
        JournalMediaMapper mediaMapper = mock(JournalMediaMapper.class);
        when(mediaMapper.selectCount(any())).thenReturn(0L);
        service = new YearReviewService(tripMapper, stopMapper, journalMapper, mediaMapper);
    }

    private TripStop stop(long tripId, String city, String country, double lat, double lon) {
        TripStop s = new TripStop();
        s.setTripId(tripId);
        s.setCityName(city);
        s.setCountryName(country);
        s.setLatitude(BigDecimal.valueOf(lat));
        s.setLongitude(BigDecimal.valueOf(lon));
        return s;
    }

    private TripStop gcjStop(long tripId, String city, String country, double wgsLat, double wgsLon) {
        double[] gcj = com.thx.traveljournal.common.util.CoordinateConverter.wgs84ToGcj02(wgsLat, wgsLon);
        TripStop stop = stop(tripId, city, country, gcj[0], gcj[1]);
        stop.setCoordinateSystem("GCJ02");
        return stop;
    }

    private JournalEntry journal(long id, Long tripId, LocalDate on) {
        JournalEntry j = new JournalEntry();
        j.setId(id);
        j.setTripId(tripId);
        j.setOccurredOn(on);
        return j;
    }

    @Test
    void 没有已发布日记时返回全零而不是报错() {
        when(journalMapper.selectList(any())).thenReturn(List.of());

        var review = service.review(2026);

        assertThat(review.year()).isEqualTo(2026);
        assertThat(review.tripCount()).isZero();
        assertThat(review.distanceKm()).isZero();
        assertThat(review.cities()).isEmpty();
    }

    @Test
    void 独立日记计入日记和照片但不虚构旅行() {
        when(journalMapper.selectList(any())).thenReturn(List.of(
                journal(7L, null, LocalDate.of(2026, 8, 11))));

        var review = service.review(2026);

        assertThat(review.journalCount()).isEqualTo(1);
        assertThat(review.tripCount()).isZero();
        assertThat(review.cities()).isEmpty();
        verify(tripMapper, never()).selectByIds(any());
        verify(stopMapper, never()).selectList(any());
    }

    @Test
    void 距离按停靠顺序累加且量级正确() {
        Trip trip = new Trip();
        trip.setId(1L);
        trip.setTitle("华东行");
        trip.setSlug("east");
        trip.setStartDate(LocalDate.of(2026, 4, 1));
        trip.setEndDate(LocalDate.of(2026, 4, 5));
        when(journalMapper.selectList(any())).thenReturn(List.of(journal(1L, 1L, LocalDate.of(2026, 4, 2))));
        when(tripMapper.selectByIds(any())).thenReturn(List.of(trip));
        // 北京 -> 上海，实际直线距离约 1067 公里
        when(stopMapper.selectList(any())).thenReturn(List.of(
                stop(1L, "北京", "中国", 39.9042, 116.4074),
                stop(1L, "上海", "中国", 31.2304, 121.4737)));

        var review = service.review(2026);

        assertThat(review.distanceKm()).isBetween(1000L, 1120L);
        assertThat(review.cityCount()).isEqualTo(2);
        assertThat(review.countryCount()).isEqualTo(1);
        assertThat(review.farthestCity()).isEqualTo("上海");
        assertThat(review.longestTripDays()).isEqualTo(5);
    }

    @Test
    void 不同旅行之间不连线() {
        Trip a = new Trip();
        a.setId(1L); a.setTitle("A"); a.setSlug("a");
        a.setStartDate(LocalDate.of(2026, 1, 1)); a.setEndDate(LocalDate.of(2026, 1, 2));
        Trip b = new Trip();
        b.setId(2L); b.setTitle("B"); b.setSlug("b");
        b.setStartDate(LocalDate.of(2026, 6, 1)); b.setEndDate(LocalDate.of(2026, 6, 2));
        when(journalMapper.selectList(any())).thenReturn(List.of(
                journal(1L, 1L, LocalDate.of(2026, 1, 1)),
                journal(2L, 2L, LocalDate.of(2026, 6, 1))));
        when(tripMapper.selectByIds(any())).thenReturn(List.of(a, b));
        // 两次旅行各只有一个停靠点，各自内部距离为 0，跨旅行不应该连起来算
        when(stopMapper.selectList(any())).thenReturn(List.of(
                stop(1L, "北京", "中国", 39.9042, 116.4074),
                stop(2L, "上海", "中国", 31.2304, 121.4737)));

        var review = service.review(2026);

        assertThat(review.distanceKm()).isZero();
        assertThat(review.tripCount()).isEqualTo(2);
    }

    @Test
    void 历史Gcj02停靠点按元数据转为Wgs84后再统计距离() {
        Trip trip = new Trip();
        trip.setId(1L); trip.setTitle("历史坐标旅行"); trip.setSlug("legacy-coordinates");
        trip.setStartDate(LocalDate.of(2026, 4, 1)); trip.setEndDate(LocalDate.of(2026, 4, 5));
        when(journalMapper.selectList(any())).thenReturn(List.of(journal(1L, 1L, LocalDate.of(2026, 4, 2))));
        when(tripMapper.selectByIds(any())).thenReturn(List.of(trip));
        when(stopMapper.selectList(any())).thenReturn(List.of(
                gcjStop(1L, "北京", "中国", 39.9042, 116.4074),
                gcjStop(1L, "上海", "中国", 31.2304, 121.4737)));

        var review = service.review(2026);

        assertThat(review.distanceKm()).isBetween(1000L, 1120L);
    }

    @Test
    void 坐标缺失的停靠点不影响统计() {
        Trip trip = new Trip();
        trip.setId(1L); trip.setTitle("T"); trip.setSlug("t");
        trip.setStartDate(LocalDate.of(2026, 3, 1)); trip.setEndDate(LocalDate.of(2026, 3, 3));
        TripStop noCoords = new TripStop();
        noCoords.setTripId(1L);
        noCoords.setCityName("未知");
        noCoords.setCountryName("中国");
        when(journalMapper.selectList(any())).thenReturn(List.of(journal(1L, 1L, LocalDate.of(2026, 3, 2))));
        when(tripMapper.selectByIds(any())).thenReturn(List.of(trip));
        when(stopMapper.selectList(any())).thenReturn(List.of(
                stop(1L, "北京", "中国", 39.9042, 116.4074), noCoords));

        var review = service.review(2026);

        assertThat(review.distanceKm()).isZero();   // 缺坐标的那段按 0 算，不抛异常
        assertThat(review.cityCount()).isEqualTo(2);
    }
}
