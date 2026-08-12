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
import com.thx.traveljournal.common.util.CoordinateConverter;
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

/**
 * 旅行服务：旅行本体和城市停靠点的增删改查。
 *
 * <p>按规范旅行不提供物理删除，不需要的旅行改成 ARCHIVED 归档。</p>
 */
@Service
@RequiredArgsConstructor
public class TripService {
    private static final Set<String> STATUSES = Set.of("PLANNING", "ONGOING", "COMPLETED", "ARCHIVED");
    /** 新建旅行时自动生成的默认预算分类，省得每次从零开始建 */
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
    /** 新建旅行，同时铺一套默认预算分类。 */
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

    /** 更新旅行。逐字段拷贝而不是整体替换，避免把请求体里没有的字段冲成 null。 */
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
        trip.setThemeKey(input.getThemeKey());
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

    /** 工作台概览用的统计数据：城市数、行程数、日记数和预算执行情况。 */
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
                .eq(TripStop::getTripId, tripId).orderByAsc(TripStop::getSortOrder, TripStop::getId))
                .stream().map(this::canonicalReadView).toList();
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
        return canonicalReadView(stop);
    }

    public TripStop updateStop(Long id, TripStop input) {
        TripStop stop = getStop(id);
        stop.setCityName(input.getCityName());
        stop.setRegionName(input.getRegionName());
        stop.setCountryName(input.getCountryName());
        stop.setCountryCode(input.getCountryCode());
        stop.setLatitude(input.getLatitude());
        stop.setLongitude(input.getLongitude());
        stop.setPlaceId(input.getPlaceId());
        stop.setFormattedAddress(input.getFormattedAddress());
        stop.setAdcode(input.getAdcode());
        stop.setCoordinateSystem(input.getCoordinateSystem());
        stop.setLocationSource(input.getLocationSource());
        stop.setArrivalDate(input.getArrivalDate());
        stop.setDepartureDate(input.getDepartureDate());
        stop.setSortOrder(input.getSortOrder());
        stop.setNote(input.getNote());
        validateStop(stop);
        stopMapper.updateById(stop);
        return canonicalReadView(stop);
    }

    public void deleteStop(Long id) {
        getStop(id);
        stopMapper.deleteById(id);
    }

    @Transactional
    /** 重排城市顺序，传入的 id 必须与该旅行现有城市完全一致，防止误传别的旅行的 id。 */
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

    /** 落库前的归一化和校验：日期先后、slug 规范化、状态合法性、币种大写。 */
    private void prepare(Trip trip) {
        if (trip.getEndDate().isBefore(trip.getStartDate())) throw BusinessException.badRequest("结束日期不能早于开始日期");
        trip.setSlug(SlugUtils.normalize(trip.getSlug()));
        validateStatus(trip.getStatus());
        trip.setDefaultCurrency(trip.getDefaultCurrency().toUpperCase());
    }

    private void validateStatus(String status) {
        if (!STATUSES.contains(status)) throw BusinessException.badRequest("无效的旅行状态");
    }

    /**
     * 校验城市停靠点。
     *
     * <p>经纬度同时为 0 会落在几内亚湾的「空岛」上，通常是前端没选点就提交了，所以单独拦一下。</p>
     */
    private void validateStop(TripStop stop) {
        if (stop.getLatitude() == null || stop.getLongitude() == null)
            throw BusinessException.badRequest("请选择地点坐标");
        if (stop.getLatitude().compareTo(BigDecimal.valueOf(-90)) < 0 || stop.getLatitude().compareTo(BigDecimal.valueOf(90)) > 0)
            throw BusinessException.badRequest("纬度必须在 -90 到 90 之间");
        if (stop.getLongitude().compareTo(BigDecimal.valueOf(-180)) < 0 || stop.getLongitude().compareTo(BigDecimal.valueOf(180)) > 0)
            throw BusinessException.badRequest("经度必须在 -180 到 180 之间");
        if (stop.getLatitude().compareTo(BigDecimal.ZERO) == 0 && stop.getLongitude().compareTo(BigDecimal.ZERO) == 0)
            throw BusinessException.badRequest("地点坐标不能同时为 0，请在地图上选择真实位置");
        if (stop.getArrivalDate() != null && stop.getDepartureDate() != null && stop.getDepartureDate().isBefore(stop.getArrivalDate()))
            throw BusinessException.badRequest("离开日期不能早于到达日期");
        if (StringUtils.hasText(stop.getCountryCode())) stop.setCountryCode(stop.getCountryCode().trim().toUpperCase());
        // 数据库长期标准坐标是 WGS84（见 CoordinateConverter）；没传坐标系时默认按新标准算，
        // 不再默认成 GCJ02——旧的高德搜索/选点入口已经在服务端转换成 WGS84 再传过来了。
        String coordinateSystem = StringUtils.hasText(stop.getCoordinateSystem())
                ? stop.getCoordinateSystem().trim().toUpperCase() : "WGS84";
        if (!Set.of("GCJ02", "WGS84").contains(coordinateSystem))
            throw BusinessException.badRequest("坐标系仅支持 GCJ02 或 WGS84");
        // 新写入一律规范成 WGS84。GCJ02 只作为历史/外部输入格式存在，转换依赖明确元数据，
        // 不根据国内坐标范围猜测，所以不会误转换来源不明的生产数据。
        BigDecimal[] wgs84 = CoordinateConverter.toWgs84(stop.getLatitude(), stop.getLongitude(), coordinateSystem);
        stop.setLatitude(wgs84[0]);
        stop.setLongitude(wgs84[1]);
        stop.setCoordinateSystem("WGS84");
        String source = StringUtils.hasText(stop.getLocationSource())
                ? stop.getLocationSource().trim().toUpperCase() : "MANUAL";
        if (!Set.of("AMAP_SEARCH", "AMAP_REVERSE", "MAP_PICK", "MANUAL").contains(source))
            throw BusinessException.badRequest("无效的地点来源");
        stop.setLocationSource(source);
    }

    /** 后台读取历史停靠点时也统一给 WGS84，但只改本次响应对象，不批量写回数据库。 */
    private TripStop canonicalReadView(TripStop stop) {
        BigDecimal[] wgs84 = CoordinateConverter.toWgs84(
                stop.getLatitude(), stop.getLongitude(), stop.getCoordinateSystem());
        stop.setLatitude(wgs84[0]);
        stop.setLongitude(wgs84[1]);
        stop.setCoordinateSystem("WGS84");
        return stop;
    }
}
