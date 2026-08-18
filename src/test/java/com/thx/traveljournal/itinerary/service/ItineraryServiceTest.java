package com.thx.traveljournal.itinerary.service;

import com.thx.traveljournal.itinerary.entity.ItineraryItem;
import com.thx.traveljournal.itinerary.mapper.ItineraryMapper;
import com.thx.traveljournal.trip.entity.Trip;
import com.thx.traveljournal.trip.mapper.TripMapper;
import com.thx.traveljournal.trip.mapper.TripStopMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** 行程的排序号分配：新增一律排在末尾，且不听前端的。 */
class ItineraryServiceTest {
    private ItineraryMapper mapper;
    private ItineraryService service;

    @BeforeEach
    void setUp() {
        mapper = mock(ItineraryMapper.class);
        TripMapper tripMapper = mock(TripMapper.class);
        Trip trip = new Trip();
        trip.setId(1L);
        trip.setStartDate(LocalDate.of(2026, 8, 1));
        trip.setEndDate(LocalDate.of(2026, 8, 20));
        when(tripMapper.selectById(1L)).thenReturn(trip);
        service = new ItineraryService(mapper, tripMapper, mock(TripStopMapper.class));
    }

    @Test
    void newItemGoesToTheEndRegardlessOfWhatTheFormSent() {
        /*
         * 两个坑叠在一起：用条数当序号，删过中间那条之后必然和现有的撞车；而新建表单
         * 又带着一个初值 sortOrder=0 一起发上来，照单全收会把新行程插到最前面。
         */
        when(mapper.selectList(any())).thenReturn(List.of(itemAt(0), itemAt(2)));

        ItineraryItem created = service.create(1L, item(0), false);

        assertThat(created.getSortOrder()).isEqualTo(3);
    }

    @Test
    void editingAnItemKeepsTheOrderItAlreadyHad() {
        // 顺序不归编辑表单管，reorder 才是唯一入口；表单没带就保留库里那个
        ItineraryItem stored = itemAt(4);
        stored.setId(9L);
        stored.setTripId(1L);
        when(mapper.selectById(9L)).thenReturn(stored);

        ItineraryItem input = item(null);
        service.update(9L, input, false);

        assertThat(input.getSortOrder()).isEqualTo(4);
    }

    private ItineraryItem item(Integer sortOrder) {
        ItineraryItem value = new ItineraryItem();
        value.setTripId(1L);
        value.setItemDate(LocalDate.of(2026, 8, 5));
        value.setType("ATTRACTION");
        value.setTitle("宽窄巷子");
        value.setSortOrder(sortOrder);
        return value;
    }

    private ItineraryItem itemAt(int sortOrder) {
        return item(sortOrder);
    }
}
