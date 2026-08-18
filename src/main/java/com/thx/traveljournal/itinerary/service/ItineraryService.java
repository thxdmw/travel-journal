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
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/** 行程服务：按天安排的行程条目的增删改查、完成勾选和排序。 */
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

    /**
     * 新增行程，一律排在末尾。
     *
     * <p>序号由后端分配，不接受前端传来的值：新建表单里那个 {@code sortOrder} 只是个
     * 表单初值，照单全收会把新行程插到已经排好的顺序最前面。要改顺序请走
     * {@link #reorder}。</p>
     *
     * @param allowOutsideDates 是否允许日期超出旅行的起止范围；
     *                          前端弹窗里有对应的勾选项，默认不允许
     */
    public ItineraryItem create(Long tripId, ItineraryItem item, boolean allowOutsideDates) {
        item.setTripId(tripId);
        validate(item, allowOutsideDates);
        item.setSortOrder(nextSortOrder(tripId));
        if (item.getCompleted() == null) item.setCompleted(false);
        mapper.insert(item);
        return item;
    }

    /**
     * 下一个序号：现有最大值 + 1。
     *
     * <p>不能用条数。删掉中间一条之后 [0,1,2] 变成 [0,2]，条数是 2，最大序号也是 2，
     * 新增的那条会和现有的撞在一起。</p>
     */
    private int nextSortOrder(Long tripId) {
        return mapper.selectList(new LambdaQueryWrapper<ItineraryItem>()
                        .eq(ItineraryItem::getTripId, tripId)).stream()
                .map(ItineraryItem::getSortOrder)
                .filter(Objects::nonNull)
                .max(Integer::compareTo).map(max -> max + 1).orElse(0);
    }

    public ItineraryItem update(Long id, ItineraryItem input, boolean allowOutsideDates) {
        ItineraryItem item = get(id);
        Long tripId = item.getTripId();
        input.setId(id);
        input.setTripId(tripId);
        // 顺序不归编辑表单管，reorder 才是唯一入口；表单没带就保留库里那个
        if (input.getSortOrder() == null) input.setSortOrder(item.getSortOrder());
        validate(input, allowOutsideDates);
        mapper.updateById(input);
        return get(id);
    }

    /** 单独勾选完成状态，不走完整校验，避免历史数据因为规则变化而改不动。 */
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

    /** 校验行程：类型合法、日期在旅行范围内、结束时间不早于开始时间、城市属于本次旅行。 */
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
