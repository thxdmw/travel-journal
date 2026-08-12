package com.thx.traveljournal.trip.service;

import com.thx.traveljournal.budget.mapper.BudgetCategoryMapper;
import com.thx.traveljournal.budget.mapper.ExpenseMapper;
import com.thx.traveljournal.common.exception.BusinessException;
import com.thx.traveljournal.itinerary.mapper.ItineraryMapper;
import com.thx.traveljournal.journal.mapper.JournalMapper;
import com.thx.traveljournal.trip.entity.Trip;
import com.thx.traveljournal.trip.entity.TripStop;
import com.thx.traveljournal.trip.mapper.TripMapper;
import com.thx.traveljournal.trip.mapper.TripStopMapper;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TripServiceTest {
    @Test
    void shouldRejectReversedDates() {
        TripService service = new TripService(mock(TripMapper.class), mock(TripStopMapper.class),
                mock(ItineraryMapper.class), mock(BudgetCategoryMapper.class),
                mock(ExpenseMapper.class), mock(JournalMapper.class));
        Trip trip = new Trip();
        trip.setTitle("测试旅行");
        trip.setSlug("test-trip");
        trip.setStatus("PLANNING");
        trip.setDefaultCurrency("CNY");
        trip.setStartDate(LocalDate.of(2026, 8, 10));
        trip.setEndDate(LocalDate.of(2026, 8, 1));
        assertThatThrownBy(() -> service.create(trip))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("结束日期");
    }

    @Test
    void shouldRejectEmptyMapCoordinates() {
        TripMapper tripMapper = mock(TripMapper.class);
        Trip existing = new Trip();
        existing.setId(1L);
        when(tripMapper.selectById(1L)).thenReturn(existing);
        TripService service = new TripService(tripMapper, mock(TripStopMapper.class),
                mock(ItineraryMapper.class), mock(BudgetCategoryMapper.class),
                mock(ExpenseMapper.class), mock(JournalMapper.class));
        TripStop stop = new TripStop();
        stop.setCityName("未选择地点");
        stop.setCountryName("中国");
        stop.setLatitude(BigDecimal.ZERO);
        stop.setLongitude(BigDecimal.ZERO);
        assertThatThrownBy(() -> service.createStop(1L, stop))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("不能同时为 0");
    }

    private TripService serviceWithExistingTrip(Long tripId) {
        TripMapper tripMapper = mock(TripMapper.class);
        Trip existing = new Trip();
        existing.setId(tripId);
        when(tripMapper.selectById(tripId)).thenReturn(existing);
        return new TripService(tripMapper, mock(TripStopMapper.class),
                mock(ItineraryMapper.class), mock(BudgetCategoryMapper.class),
                mock(ExpenseMapper.class), mock(JournalMapper.class));
    }

    private TripStop validStop() {
        TripStop stop = new TripStop();
        stop.setCityName("青城山");
        stop.setCountryName("中国");
        stop.setLatitude(BigDecimal.valueOf(30.9021));
        stop.setLongitude(BigDecimal.valueOf(103.5678));
        return stop;
    }

    /** 数据库长期标准坐标是 WGS84：没传坐标系时按新标准默认，不再默认成旧的 GCJ02。 */
    @Test
    void defaultsCoordinateSystemToWgs84WhenNotProvided() {
        TripService service = serviceWithExistingTrip(1L);
        TripStop stop = validStop();

        TripStop saved = service.createStop(1L, stop);

        assertThat(saved.getCoordinateSystem()).isEqualTo("WGS84");
    }

    /** 新写入即使明确来自 GCJ02，也必须在服务边界转成 WGS84 再落库。 */
    @Test
    void convertsExplicitGcj02InputToCanonicalWgs84() {
        TripService service = serviceWithExistingTrip(1L);
        TripStop stop = validStop();
        stop.setCoordinateSystem("gcj02");
        BigDecimal originalLatitude = stop.getLatitude();
        BigDecimal originalLongitude = stop.getLongitude();

        TripStop saved = service.createStop(1L, stop);

        assertThat(saved.getCoordinateSystem()).isEqualTo("WGS84");
        assertThat(saved.getLatitude()).isNotEqualByComparingTo(originalLatitude);
        assertThat(saved.getLongitude()).isNotEqualByComparingTo(originalLongitude);
    }

    @Test
    void rejectsUnknownCoordinateSystem() {
        TripService service = serviceWithExistingTrip(1L);
        TripStop stop = validStop();
        stop.setCoordinateSystem("BD09");

        assertThatThrownBy(() -> service.createStop(1L, stop))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("坐标系");
    }
}
