package com.thx.traveljournal.itinerary.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.thx.traveljournal.common.exception.BusinessException;
import com.thx.traveljournal.itinerary.entity.ItineraryItem;
import com.thx.traveljournal.itinerary.mapper.ItineraryMapper;
import com.thx.traveljournal.trip.entity.Trip;
import com.thx.traveljournal.trip.entity.TripStop;
import com.thx.traveljournal.trip.mapper.TripMapper;
import com.thx.traveljournal.trip.mapper.TripStopMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ItineraryService {
    private static final Set<String> TYPES = Set.of("TRANSPORT","HOTEL","FOOD","ATTRACTION","SHOPPING","ACTIVITY","OTHER");
    private final ItineraryMapper mapper;
    private final TripMapper tripMapper;
    private final TripStopMapper stopMapper;

    public List<ItineraryItem> list(Long tripId) {
        requireTrip(tripId);
        return mapper.selectList(new LambdaQueryWrapper<ItineraryItem>()
                .eq(ItineraryItem::getTripId, tripId)
                .orderByAsc(ItineraryItem::getItemDate, ItineraryItem::getSortOrder, ItineraryItem::getStartTime));
    }

    public ItineraryItem get(Long id) {
        ItineraryItem item = mapper.selectById(id);
        if (item == null) throw BusinessException.notFound("行程不存在");
        return item;
    }

    public ItineraryItem create(Long tripId, ItineraryItem item, boolean allowOutsideDates) {
        item.setTripId(tripId);
        validate(item, allowOutsideDates);
        if (item.getSortOrder() == null) {
            item.setSortOrder(mapper.selectCount(new LambdaQueryWrapper<ItineraryItem>().eq(ItineraryItem::getTripId, tripId)).intValue());
        }
        if (item.getCompleted() == null) item.setCompleted(false);
        mapper.insert(item);
        return item;
    }

    public ItineraryItem update(Long id, ItineraryItem input, boolean allowOutsideDates) {
        ItineraryItem item = get(id);
        Long tripId = item.getTripId();
        input.setId(id);
        input.setTripId(tripId);
        validate(input, allowOutsideDates);
        mapper.updateById(input);
        return get(id);
    }

    public ItineraryItem setCompleted(Long id, boolean completed) {
        ItineraryItem item = get(id);
        item.setCompleted(completed);
        mapper.updateById(item);
        return item;
    }

    public void delete(Long id) {
        get(id);
        mapper.deleteById(id);
    }

    @Transactional
    public void reorder(Long tripId, List<Long> ids) {
        List<ItineraryItem> current = list(tripId);
        if (current.size() != ids.size() || !current.stream().map(ItineraryItem::getId).collect(Collectors.toSet()).equals(Set.copyOf(ids))) {
            throw BusinessException.badRequest("排序列表必须包含该旅行的全部行程");
        }
        for (int i = 0; i < ids.size(); i++) {
            ItineraryItem item = get(ids.get(i));
            item.setSortOrder(i);
            mapper.updateById(item);
        }
    }

    private void validate(ItineraryItem item, boolean allowOutsideDates) {
        Trip trip = requireTrip(item.getTripId());
        if (!TYPES.contains(item.getType())) throw BusinessException.badRequest("无效的行程类型");
        if (!allowOutsideDates && (item.getItemDate().isBefore(trip.getStartDate()) || item.getItemDate().isAfter(trip.getEndDate()))) {
            throw BusinessException.badRequest("行程日期不在旅行日期范围内，可确认例外后重试");
        }
        if (item.getStartTime() != null && item.getEndTime() != null && item.getEndTime().isBefore(item.getStartTime())) {
            throw BusinessException.badRequest("结束时间不能早于开始时间");
        }
        if (item.getPlannedCost() != null && item.getPlannedCost().signum() < 0) {
            throw BusinessException.badRequest("预计花费不能为负数");
        }
        if (item.getTripStopId() != null) {
            TripStop stop = stopMapper.selectById(item.getTripStopId());
            if (stop == null || !item.getTripId().equals(stop.getTripId())) throw BusinessException.badRequest("城市不属于当前旅行");
        }
    }

    private Trip requireTrip(Long id) {
        Trip trip = tripMapper.selectById(id);
        if (trip == null) throw BusinessException.notFound("旅行不存在");
        return trip;
    }
}
