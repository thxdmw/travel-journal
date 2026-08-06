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
}
