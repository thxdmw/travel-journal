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
import com.thx.traveljournal.itinerary.entity.ItineraryItem;
import com.thx.traveljournal.journal.entity.JournalEntry;
import com.thx.traveljournal.journal.mapper.JournalMapper;
import com.thx.traveljournal.journal.service.JournalService;
import com.thx.traveljournal.media.entity.JournalMedia;
import com.thx.traveljournal.media.mapper.JournalMediaMapper;
import com.thx.traveljournal.media.service.MediaService;
import com.thx.traveljournal.moment.service.MomentService;
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
 * <p>日常整理用「归档」（ARCHIVED）就够了，那是给「这趟走完了，先收起来」用的；
 * {@link #delete} 是另一回事——它会把这次旅行连同下面的日记、随手记、照片、行程、
 * 预算和支出一起抹掉，且不可撤销，只在作者确实要清掉一整场误建或作废的旅行时用。</p>
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
    /*
     * 级联删除要用到的三个下游服务。
     *
     * 这里刻意不自己写 SQL 去删 journal_media / moment_media：对象存储里的文件、
     * 封面引用、以及「这张照片是不是还被别处引用」这些判断都在各自模块里，
     * 绕过它们直接删表，留下的就是数据库干净、桶里全是孤儿文件。
     */
    private final MediaService mediaService;
    private final JournalService journalService;
    private final MomentService momentService;
    private final JournalMediaMapper journalMediaMapper;

    public PageResponse<Trip> list(long page, long pageSize, String keyword) {
        LambdaQueryWrapper<Trip> query = new LambdaQueryWrapper<Trip>().orderByDesc(Trip::getStartDate);
        if (StringUtils.hasText(keyword)) query.like(Trip::getTitle, keyword.trim());
        Page<Trip> result = tripMapper.selectPage(Page.of(page, pageSize), query);
        return PageResponse.of(result.getRecords(), page, pageSize, result.getTotal());
    }

    /**
     * 旅行选择器用的轻量选项，按开始日期倒序。
     *
     * @param id     旅行 id
     * @param title  旅行标题
     * @param status 旅行状态，随手记靠它默认选中正在进行的那一场
     */
    public record TripOption(Long id, String title, String status) {}

    /** 只查三列，不做分页——下拉里静默少几个旅行，比多查两列糟糕得多。 */
    public List<TripOption> options() {
        return tripMapper.selectList(new LambdaQueryWrapper<Trip>()
                        .select(Trip::getId, Trip::getTitle, Trip::getStatus)
                        .orderByDesc(Trip::getStartDate))
                .stream()
                .map(trip -> new TripOption(trip.getId(), trip.getTitle(), trip.getStatus()))
                .toList();
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

    /**
     * 删除一次旅行前的清点结果，给确认弹窗用。
     *
     * <p>删除是不可撤销的，作者有权在按下确认之前知道这一下会带走多少东西。</p>
     */
    public record DeletionSummary(String title, long journalCount, long momentCount, long photoCount,
                                  long stopCount, long itineraryCount, long expenseCount) {}

    /** 清点这次旅行下面挂着多少东西。 */
    public DeletionSummary deletionSummary(Long tripId) {
        Trip trip = get(tripId);
        List<Long> journalIds = journalIdsOf(tripId);
        long journalPhotos = journalIds.isEmpty() ? 0 : journalMediaMapper.selectCount(
                new LambdaQueryWrapper<JournalMedia>().in(JournalMedia::getJournalEntryId, journalIds));
        return new DeletionSummary(trip.getTitle(), journalIds.size(),
                momentService.countByTrip(tripId),
                // 随手记照片整理进日记后会被两边同时引用，这里按「会被删掉的关系条数」报，
                // 说明的是规模而不是精确的文件数，作者要的就是一个量级感
                journalPhotos + momentService.photoCountByTrip(tripId),
                stopMapper.selectCount(new LambdaQueryWrapper<TripStop>().eq(TripStop::getTripId, tripId)),
                itineraryMapper.selectCount(new LambdaQueryWrapper<ItineraryItem>()
                        .eq(ItineraryItem::getTripId, tripId)),
                expenseMapper.selectCount(new LambdaQueryWrapper<Expense>().eq(Expense::getTripId, tripId)));
    }

    /**
     * 删除一次旅行，连同它下面的一切。
     *
     * <p>删除顺序不是随意的，每一步都有理由：</p>
     *
     * <pre>
     * 锁住 trip 行        并发的日记新建、随手记上传都要先拿到它，删除期间进不来
     * 随手记 + 照片        先解除关系，再交给 media 判断文件该不该回收
     * 日记 + 图片          走 JournalService.delete，正文引用、封面引用、MinIO 文件一并处理
     * 支出 → 预算分类      expense 指向 budget_category 且不是级联，必须先删支出
     * 行程 → 城市          itinerary_item / expense 都可能指向 trip_stop
     * 旅行封面             最后清，前面几步可能刚把它变成孤儿
     * trip 本体
     * </pre>
     *
     * <p>数据库上这些子表大多写着 {@code on delete cascade}，但级联只会删表里的行，
     * 不会去对象存储里删文件，也不会判断一张照片是不是还被别的地方引用着。所以这里
     * 逐层显式删，让每一层都经过自己模块的清理逻辑。</p>
     *
     * @return 删除前的清点结果，供前端提示「已删除 N 篇日记、M 条随手记」
     */
    @Transactional
    public DeletionSummary delete(Long tripId) {
        DeletionSummary summary = deletionSummary(tripId);
        lock(tripId);
        momentService.purgeTripMoments(tripId);
        for (Long journalId : journalIdsOf(tripId)) journalService.delete(journalId);
        expenseMapper.delete(new LambdaQueryWrapper<Expense>().eq(Expense::getTripId, tripId));
        budgetMapper.delete(new LambdaQueryWrapper<BudgetCategory>().eq(BudgetCategory::getTripId, tripId));
        itineraryMapper.delete(new LambdaQueryWrapper<ItineraryItem>().eq(ItineraryItem::getTripId, tripId));
        stopMapper.delete(new LambdaQueryWrapper<TripStop>().eq(TripStop::getTripId, tripId));
        mediaService.clearTripCover(tripId);
        tripMapper.deleteById(tripId);
        return summary;
    }

    /** 这次旅行下面的日记 id。 */
    private List<Long> journalIdsOf(Long tripId) {
        return journalMapper.selectList(new LambdaQueryWrapper<JournalEntry>()
                        .select(JournalEntry::getId).eq(JournalEntry::getTripId, tripId))
                .stream().map(JournalEntry::getId).toList();
    }

    /** 锁住旅行行，删除期间不接受新的日记、随手记挂进来。 */
    private void lock(Long tripId) {
        Trip locked = tripMapper.selectOne(new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<Trip>()
                .eq("id", tripId).last("for update"));
        if (locked == null) throw BusinessException.notFound("旅行不存在");
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
