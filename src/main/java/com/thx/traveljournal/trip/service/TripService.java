package com.thx.traveljournal.trip.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.thx.traveljournal.budget.entity.BudgetCategory;
import com.thx.traveljournal.budget.mapper.BudgetCategoryMapper;
import com.thx.traveljournal.budget.entity.Expense;
import com.thx.traveljournal.budget.mapper.ExpenseMapper;
import com.thx.traveljournal.common.api.PageResponse;
import com.thx.traveljournal.common.exception.BusinessException;
import com.thx.traveljournal.common.util.SlugUtils;
import com.thx.traveljournal.itinerary.mapper.ItineraryMapper;
import com.thx.traveljournal.journal.entity.JournalEntry;
import com.thx.traveljournal.journal.mapper.JournalMapper;
import com.thx.traveljournal.trip.entity.Trip;
import com.thx.traveljournal.trip.entity.TripStop;
import com.thx.traveljournal.trip.mapper.TripMapper;
import com.thx.traveljournal.trip.mapper.TripStopMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class TripService {
    private static final Set<String> STATUSES = Set.of("PLANNING", "ONGOING", "COMPLETED", "ARCHIVED");
    private static final List<String[]> DEFAULT_BUDGETS = List.of(
            new String[]{"TRANSPORT", "交通"}, new String[]{"HOTEL", "住宿"},
            new String[]{"FOOD", "餐饮"}, new String[]{"TICKET", "门票"},
            new String[]{"SHOPPING", "购物"}, new String[]{"ACTIVITY", "娱乐"},
            new String[]{"OTHER", "其他"});
    private final TripMapper tripMapper;
    private final TripStopMapper stopMapper;
    private final ItineraryMapper itineraryMapper;
    private final BudgetCategoryMapper budgetMapper;
    private final ExpenseMapper expenseMapper;
    private final JournalMapper journalMapper;

    public PageResponse<Trip> list(long page, long pageSize, String keyword) {
        LambdaQueryWrapper<Trip> query = new LambdaQueryWrapper<Trip>().orderByDesc(Trip::getStartDate);
        if (StringUtils.hasText(keyword)) query.like(Trip::getTitle, keyword.trim());
        Page<Trip> result = tripMapper.selectPage(Page.of(page, pageSize), query);
        return PageResponse.of(result.getRecords(), page, pageSize, result.getTotal());
    }

    public Trip get(Long id) {
        Trip trip = tripMapper.selectById(id);
        if (trip == null) throw BusinessException.notFound("旅行不存在");
        return trip;
    }

    @Transactional
    public Trip create(Trip trip) {
        prepare(trip);
        tripMapper.insert(trip);
        for (int i = 0; i < DEFAULT_BUDGETS.size(); i++) {
            String[] item = DEFAULT_BUDGETS.get(i);
            BudgetCategory category = new BudgetCategory();
            category.setTripId(trip.getId());
            category.setCode(item[0]);
            category.setName(item[1]);
            category.setPlannedAmount(BigDecimal.ZERO);
            category.setSortOrder(i);
            budgetMapper.insert(category);
        }
        return trip;
    }

    public Trip update(Long id, Trip input) {
        Trip trip = get(id);
        trip.setTitle(input.getTitle());
        trip.setSlug(input.getSlug());
        trip.setSummary(input.getSummary());
        trip.setStatus(input.getStatus());
        trip.setStartDate(input.getStartDate());
        trip.setEndDate(input.getEndDate());
        trip.setDefaultCurrency(input.getDefaultCurrency());
        trip.setCoverMediaId(input.getCoverMediaId());
        trip.setInternalNote(input.getInternalNote());
        prepare(trip);
        tripMapper.updateById(trip);
        return trip;
    }

    public Trip updateStatus(Long id, String status) {
        Trip trip = get(id);
        validateStatus(status);
        trip.setStatus(status);
        tripMapper.updateById(trip);
        return trip;
    }

    public Map<String, Object> dashboard(Long tripId) {
        Trip trip = get(tripId);
        long stops = stopMapper.selectCount(new LambdaQueryWrapper<TripStop>().eq(TripStop::getTripId, tripId));
        long itinerary = itineraryMapper.selectCount(new LambdaQueryWrapper<com.thx.traveljournal.itinerary.entity.ItineraryItem>()
                .eq(com.thx.traveljournal.itinerary.entity.ItineraryItem::getTripId, tripId));
        long drafts = journalMapper.selectCount(new LambdaQueryWrapper<JournalEntry>()
                .eq(JournalEntry::getTripId, tripId).eq(JournalEntry::getStatus, "DRAFT"));
        long published = journalMapper.selectCount(new LambdaQueryWrapper<JournalEntry>()
                .eq(JournalEntry::getTripId, tripId).eq(JournalEntry::getStatus, "PUBLISHED"));
        BigDecimal budgetTotal = budgetMapper.selectList(new LambdaQueryWrapper<BudgetCategory>()
                .eq(BudgetCategory::getTripId, tripId)).stream()
                .map(BudgetCategory::getPlannedAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal actualExpense = expenseMapper.selectList(new LambdaQueryWrapper<Expense>()
                .eq(Expense::getTripId, tripId)).stream()
                .map(Expense::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        return Map.of("trip", trip, "stopCount", stops, "itineraryCount", itinerary,
                "draftCount", drafts, "publishedCount", published, "budgetTotal", budgetTotal,
                "actualExpense", actualExpense, "remainingBudget", budgetTotal.subtract(actualExpense));
    }

    public List<TripStop> stops(Long tripId) {
        get(tripId);
        return stopMapper.selectList(new LambdaQueryWrapper<TripStop>()
                .eq(TripStop::getTripId, tripId).orderByAsc(TripStop::getSortOrder, TripStop::getId));
    }

    public TripStop getStop(Long id) {
        TripStop stop = stopMapper.selectById(id);
        if (stop == null) throw BusinessException.notFound("城市停靠点不存在");
        return stop;
    }

    public TripStop createStop(Long tripId, TripStop stop) {
        get(tripId);
        stop.setTripId(tripId);
        validateStop(stop);
        if (stop.getSortOrder() == null) {
            Long count = stopMapper.selectCount(new LambdaQueryWrapper<TripStop>().eq(TripStop::getTripId, tripId));
            stop.setSortOrder(count.intValue());
        }
        stopMapper.insert(stop);
        return stop;
    }

    public TripStop updateStop(Long id, TripStop input) {
        TripStop stop = getStop(id);
        stop.setCityName(input.getCityName());
        stop.setRegionName(input.getRegionName());
        stop.setCountryName(input.getCountryName());
        stop.setCountryCode(input.getCountryCode());
        stop.setLatitude(input.getLatitude());
        stop.setLongitude(input.getLongitude());
        stop.setArrivalDate(input.getArrivalDate());
        stop.setDepartureDate(input.getDepartureDate());
        stop.setSortOrder(input.getSortOrder());
        stop.setNote(input.getNote());
        validateStop(stop);
        stopMapper.updateById(stop);
        return stop;
    }

    public void deleteStop(Long id) {
        getStop(id);
        stopMapper.deleteById(id);
    }

    @Transactional
    public void reorderStops(Long tripId, List<Long> ids) {
        List<TripStop> current = stops(tripId);
        if (current.size() != ids.size() || !current.stream().map(TripStop::getId).collect(java.util.stream.Collectors.toSet()).equals(Set.copyOf(ids))) {
            throw BusinessException.badRequest("排序列表必须包含该旅行的全部城市");
        }
        for (int i = 0; i < ids.size(); i++) {
            TripStop stop = getStop(ids.get(i));
            stop.setSortOrder(i);
            stopMapper.updateById(stop);
        }
    }

    private void prepare(Trip trip) {
        if (trip.getEndDate().isBefore(trip.getStartDate())) throw BusinessException.badRequest("结束日期不能早于开始日期");
        trip.setSlug(SlugUtils.normalize(trip.getSlug()));
        validateStatus(trip.getStatus());
        trip.setDefaultCurrency(trip.getDefaultCurrency().toUpperCase());
    }

    private void validateStatus(String status) {
        if (!STATUSES.contains(status)) throw BusinessException.badRequest("无效的旅行状态");
    }

    private void validateStop(TripStop stop) {
        if (stop.getLatitude().compareTo(BigDecimal.valueOf(-90)) < 0 || stop.getLatitude().compareTo(BigDecimal.valueOf(90)) > 0)
            throw BusinessException.badRequest("纬度必须在 -90 到 90 之间");
        if (stop.getLongitude().compareTo(BigDecimal.valueOf(-180)) < 0 || stop.getLongitude().compareTo(BigDecimal.valueOf(180)) > 0)
            throw BusinessException.badRequest("经度必须在 -180 到 180 之间");
        if (stop.getArrivalDate() != null && stop.getDepartureDate() != null && stop.getDepartureDate().isBefore(stop.getArrivalDate()))
            throw BusinessException.badRequest("离开日期不能早于到达日期");
    }
}
