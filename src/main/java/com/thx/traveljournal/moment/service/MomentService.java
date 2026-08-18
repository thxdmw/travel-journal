package com.thx.traveljournal.moment.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.thx.traveljournal.common.exception.BusinessException;
import com.thx.traveljournal.common.util.SiteClock;
import com.thx.traveljournal.media.service.MediaService;
import com.thx.traveljournal.moment.entity.Moment;
import com.thx.traveljournal.moment.entity.MomentMedia;
import com.thx.traveljournal.moment.mapper.MomentMapper;
import com.thx.traveljournal.moment.mapper.MomentMediaMapper;
import com.thx.traveljournal.trip.entity.Trip;
import com.thx.traveljournal.trip.entity.TripStop;
import com.thx.traveljournal.trip.mapper.TripMapper;
import com.thx.traveljournal.trip.mapper.TripStopMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 随手记服务。
 *
 * <p>随手记的全部设计压力都来自一个场景：人正站在路边，二十秒之内要把「刚才看到什么」
 * 记下来。所以这里没有必填字段，没有校验弹窗，也没有草稿状态——{@link #create} 只要
 * 知道属于哪次旅行就能落库，其余的都可以之后补。</p>
 */
@Service
@RequiredArgsConstructor
public class MomentService {
    /** 单条随手记最多几张照片。再多就该写日记了。 */
    private static final int MAX_PHOTOS = 9;
    private static final int MAX_CONTENT_LENGTH = 2_000;

    private final MomentMapper mapper;
    private final MomentMediaMapper mediaMapper;
    private final TripMapper tripMapper;
    private final TripStopMapper stopMapper;
    private final MediaService mediaService;
    private final SiteClock clock;
    /*
     * 自身的代理引用。
     *
     * 照片上传的重活在事务外做，落库那一小段才需要事务和行锁。同一个类里直接调用带
     * @Transactional 的方法会绕过代理，注解形同虚设，所以要拿到代理再调。
     * ObjectProvider 是延迟解析的，不会造成构造期循环依赖。
     */
    private final ObjectProvider<MomentService> self;

    /**
     * 返回给前端的一条随手记。
     *
     * @param day    这条落在站点时区的哪一天，前端按它分组，不用自己算时区
     * @param sorted 是否已经被整理进日记
     */
    public record MomentView(Long id, String clientId, Long tripId, Long tripStopId, String cityName,
                             OffsetDateTime occurredAt, LocalDate day, String occurredZoneId,
                             Integer utcOffsetMinutes, String content,
                             String placeName, BigDecimal latitude, BigDecimal longitude,
                             String mood, Long journalEntryId, boolean sorted,
                             List<MediaService.MediaView> photos) {}

    /**
     * 列出某次旅行的随手记，最近的排在前面。
     *
     * @param day       只看某一天，为空表示全部
     * @param unsorted  只看还没整理进日记的
     */
    public List<MomentView> list(Long tripId, LocalDate day, boolean unsorted) {
        requireTrip(tripId);
        LambdaQueryWrapper<Moment> query = new LambdaQueryWrapper<Moment>()
                .eq(Moment::getTripId, tripId)
                .isNull(unsorted, Moment::getJournalEntryId)
                .orderByDesc(Moment::getOccurredAt).orderByDesc(Moment::getId);
        // 「某一天」按事情发生地的当地日期查询，不再和站点时区混用。
        if (day != null) query.eq(Moment::getOccurredLocalDate, day);
        return toViews(mapper.selectList(query));
    }

    public Moment get(Long id) {
        Moment moment = mapper.selectById(id);
        if (moment == null) throw BusinessException.notFound("随手记不存在");
        return moment;
    }

    public MomentView view(Long id) {
        return toViews(List.of(get(id))).get(0);
    }

    /**
     * 记下一条。
     *
     * <p>除了「属于哪次旅行」之外什么都不强制：正文可以空（先拍照后补字），
     * 时间可以空（就是现在），地点可以空。任何一个必填项都会让这条路径变慢，
     * 而变慢就等于记不下来。</p>
     */
    @Transactional
    public Moment create(Moment input) {
        requireTrip(input.getTripId());
        mapper.lockTrip(input.getTripId());
        normalizeClientId(input);
        if (input.getClientId() != null) {
            Moment existing = mapper.selectOne(new LambdaQueryWrapper<Moment>()
                    .eq(Moment::getTripId, input.getTripId())
                    .eq(Moment::getClientId, input.getClientId()).last("limit 1"));
            if (existing != null) return existing;
        }
        if (input.getOccurredAt() == null) input.setOccurredAt(OffsetDateTime.now());
        normalizeOccurrence(input);
        normalize(input);
        input.setJournalEntryId(null);
        mapper.insert(input);
        return input;
    }

    /** 修改一条。没传的字段沿用原值，方便前端只提交改动的部分。 */
    @Transactional
    public Moment update(Long id, Moment input) {
        Moment current = get(id);
        input.setId(id);
        input.setTripId(current.getTripId());
        input.setClientId(current.getClientId());
        // 归属哪篇日记由整理流程维护，不接受前端指定
        input.setJournalEntryId(current.getJournalEntryId());
        if (input.getOccurredAt() == null) {
            input.setOccurredAt(current.getOccurredAt());
            input.setOccurredLocalDate(current.getOccurredLocalDate());
            input.setOccurredZoneId(current.getOccurredZoneId());
            input.setUtcOffsetMinutes(current.getUtcOffsetMinutes());
        } else {
            normalizeOccurrence(input);
        }
        if (input.getContent() == null) input.setContent(current.getContent());
        normalize(input);
        mapper.updateById(input);
        return get(id);
    }

    /**
     * 删除一条随手记。
     *
     * <p>照片一并解除关联；如果那张照片已经被整理进日记，它在日记那边的引用还在，
     * 所以文件本身不会被删掉。</p>
     */
    @Transactional
    public void delete(Long id) {
        // 锁住这一条：并发的加照片会在「查现有照片」和「删关系」之间插进一张新的，
        // 那张的关系行随随手记一起被级联删掉，文件却留在桶里成了孤儿
        if (mapper.lockMoment(id) == null) throw BusinessException.notFound("随手记不存在");
        List<Long> assetIds = mediaMapper.selectList(new LambdaQueryWrapper<MomentMedia>()
                        .eq(MomentMedia::getMomentId, id))
                .stream().map(MomentMedia::getMediaAssetId).distinct().toList();
        mediaMapper.delete(new LambdaQueryWrapper<MomentMedia>().eq(MomentMedia::getMomentId, id));
        mapper.deleteById(id);
        // 只解除关系不清资产的话，从没整理过的随手记照片会永远躺在桶里没人认领
        mediaService.releaseIfUnreferenced(assetIds);
    }

    /** 给一条随手记加照片。文件本身走 media 模块，这里只建立归属关系。 */
    public MediaService.MediaView addPhoto(Long momentId, MultipartFile file) {
        return addPhoto(momentId, null, file);
    }

    /**
     * 离线照片上传；同一个 clientId 重放时直接返回第一次上传的图片。
     *
     * <p>分两阶段，理由和日记图片上传一样：解码、EXIF、压四个规格、四次 MinIO 往返
     * 加起来动辄几秒，这段时间既不该占着数据库连接，更不该抓着这条随手记的行锁——
     * 手机上一次多选九张照片是常事，九个请求排队等同一把锁会把上传拖成串行。</p>
     */
    public MediaService.MediaView addPhoto(Long momentId, String clientId, MultipartFile file) {
        Moment moment = get(momentId);
        String normalizedClientId = normalizeClientId(clientId);
        // 阶段 A：事务外做完全部图片处理，此时数据库里还没有任何这张图的痕迹
        MediaService.PreparedImage prepared = mediaService.prepareLoose(file,
                "trips/" + moment.getTripId() + "/moments/" + momentId + "/");
        try {
            return self.getObject().persistMomentPhoto(momentId, normalizedClientId, prepared);
        } catch (RuntimeException ex) {
            // 阶段 B 失败时对象存储里已经躺着四个文件，必须补偿删掉
            mediaService.discardPrepared(prepared);
            throw ex;
        }
    }

    /**
     * 阶段 B：锁住这条随手记之后再做幂等检查、数量校验、分配序号、落库。
     *
     * <p>行锁把「查 clientId 有没有传过」和「插入关系」变成一步。离线队列重放时同一张
     * 照片可能同时到两次，没有锁就会两条都查不到、两条都插进去。</p>
     */
    @Transactional
    public MediaService.MediaView persistMomentPhoto(Long momentId, String clientId,
                                                     MediaService.PreparedImage prepared) {
        if (mapper.lockMoment(momentId) == null) throw BusinessException.notFound("随手记不存在");
        if (clientId != null) {
            MomentMedia existing = mediaMapper.selectOne(new LambdaQueryWrapper<MomentMedia>()
                    .eq(MomentMedia::getMomentId, momentId)
                    .eq(MomentMedia::getClientId, clientId).last("limit 1"));
            // 重放：这张照片上一次已经存过了，把准备好的这一份丢掉，返回原来那张
            if (existing != null) {
                mediaService.discardPrepared(prepared);
                return mediaService.viewOf(existing.getMediaAssetId());
            }
        }
        List<MomentMedia> current = mediaMapper.selectList(new LambdaQueryWrapper<MomentMedia>()
                .eq(MomentMedia::getMomentId, momentId));
        if (current.size() >= MAX_PHOTOS)
            throw BusinessException.badRequest("一条随手记最多 " + MAX_PHOTOS + " 张照片");
        /*
         * 序号取现有最大值 +1，不是条数。
         *
         * [0,1,2] 删掉中间那张剩下 [0,2]，条数却还是 2，再传一张就又得到一个 2——
         * 两张照片并列同一个序号，此后的显示顺序就看数据库返回谁在前。
         */
        int sortOrder = current.stream().map(MomentMedia::getSortOrder)
                .filter(java.util.Objects::nonNull)
                .max(Integer::compareTo).map(max -> max + 1).orElse(0);

        MediaService.MediaView view = mediaService.persistLoose(prepared);
        MomentMedia relation = new MomentMedia();
        relation.setMomentId(momentId);
        relation.setClientId(clientId);
        relation.setMediaAssetId(view.id());
        relation.setSortOrder(sortOrder);
        mediaMapper.insert(relation);
        // 照片带 GPS 而这条随手记还没有位置时，顺手补上——旅行中手动填坐标是不现实的
        Moment moment = get(momentId);
        if (moment.getLatitude() == null && view.gpsLatitude() != null) {
            moment.setLatitude(view.gpsLatitude());
            moment.setLongitude(view.gpsLongitude());
            moment.setCoordinateSystem("WGS84");
            mapper.updateById(moment);
        }
        return view;
    }

    /** 从随手记上撤下一张照片。 */
    @Transactional
    public void removePhoto(Long momentId, Long mediaAssetId) {
        // 和加照片、删随手记共用同一把聚合锁，否则「撤下」和「加上」会互相盖掉
        if (mapper.lockMoment(momentId) == null) throw BusinessException.notFound("随手记不存在");
        mediaMapper.delete(new LambdaQueryWrapper<MomentMedia>()
                .eq(MomentMedia::getMomentId, momentId).eq(MomentMedia::getMediaAssetId, mediaAssetId));
        // 已经整理进日记的那张仍被日记引用，releaseIfUnreferenced 会自己认出来并跳过
        mediaService.releaseIfUnreferenced(List.of(mediaAssetId));
    }

    /**
     * 清空某次旅行的全部随手记，供旅行级联删除使用。
     *
     * <p>照片先解除关系再交还给 media 模块判断该不该回收：已经整理进日记的那些照片
     * 会被日记同时引用，如果那篇日记还在（比如是独立日记），照片就不能跟着走。</p>
     *
     * @return 删掉的随手记条数
     */
    @Transactional
    public int purgeTripMoments(Long tripId) {
        /*
         * 先锁住这些行再统计照片。
         *
         * 照片上传只锁 moment 自己那一行，看不见 trip 上的锁——不锁的话，「查出照片清单」
         * 和「删掉随手记」之间会有一次上传挤进来，那张新照片的 asset 不在清单里，随手记却
         * 已经没了，于是它连同对象存储里的四个文件成了谁也引用不到的孤儿。
         */
        List<Long> momentIds = mapper.lockTripMoments(tripId);
        if (momentIds.isEmpty()) return 0;
        List<Long> assetIds = mediaMapper.selectList(new LambdaQueryWrapper<MomentMedia>()
                        .in(MomentMedia::getMomentId, momentIds))
                .stream().map(MomentMedia::getMediaAssetId).distinct().toList();
        mediaMapper.delete(new LambdaQueryWrapper<MomentMedia>().in(MomentMedia::getMomentId, momentIds));
        mapper.deleteByIds(momentIds);
        mediaService.releaseIfUnreferenced(assetIds);
        return momentIds.size();
    }

    /** 某次旅行有多少条随手记，删除确认弹窗用它说明会连带删掉多少。 */
    public long countByTrip(Long tripId) {
        return mapper.selectCount(new LambdaQueryWrapper<Moment>().eq(Moment::getTripId, tripId));
    }

    /** 某次旅行的随手记一共挂了多少张照片。 */
    public long photoCountByTrip(Long tripId) {
        List<Long> momentIds = mapper.selectList(new LambdaQueryWrapper<Moment>()
                        .select(Moment::getId).eq(Moment::getTripId, tripId))
                .stream().map(Moment::getId).toList();
        if (momentIds.isEmpty()) return 0;
        return mediaMapper.selectCount(new LambdaQueryWrapper<MomentMedia>()
                .in(MomentMedia::getMomentId, momentIds));
    }

    /** 某次旅行还有多少条没整理，按天分组。旅行工作台用它提示「今天有 6 条待整理」。 */
    public Map<LocalDate, Long> unsortedCountByDay(Long tripId) {
        return mapper.selectList(new LambdaQueryWrapper<Moment>()
                        .eq(Moment::getTripId, tripId).isNull(Moment::getJournalEntryId))
                .stream().collect(Collectors.groupingBy(
                        Moment::getOccurredLocalDate,
                        java.util.TreeMap::new, Collectors.counting()));
    }

    /**
     * 锁定某一天本次允许整理的随手记。
     *
     * <p>追加只拿尚未整理的记录；替换则还可以重新读取已经属于当前日记的记录。
     * 已属于其他日记的记录永远不会被拿走。行锁一直持有到 compose 事务结束，避免
     * 连点两次时两个请求同时把同一批记录追加进正文。</p>
     */
    public List<Moment> forCompose(Long tripId, LocalDate day, Long journalId, boolean replace) {
        LambdaQueryWrapper<Moment> query = new LambdaQueryWrapper<Moment>()
                .eq(Moment::getTripId, tripId)
                .eq(Moment::getOccurredLocalDate, day);
        if (replace && journalId != null) {
            query.and(scope -> scope.isNull(Moment::getJournalEntryId)
                    .or().eq(Moment::getJournalEntryId, journalId));
        } else {
            query.isNull(Moment::getJournalEntryId);
        }
        return mapper.selectList(query.orderByAsc(Moment::getOccurredAt).orderByAsc(Moment::getId)
                .last("for update"));
    }

    /** 一条随手记的照片，按加入顺序。 */
    public List<Long> photoIds(Long momentId) {
        return mediaMapper.selectList(new LambdaQueryWrapper<MomentMedia>()
                        .eq(MomentMedia::getMomentId, momentId)
                        .orderByAsc(MomentMedia::getSortOrder, MomentMedia::getId))
                .stream().map(MomentMedia::getMediaAssetId).toList();
    }

    /** 标记这些随手记已经被整理进某篇日记。 */
    @Transactional
    public int markSorted(List<Long> momentIds, Long journalId) {
        if (momentIds == null || momentIds.isEmpty()) return 0;
        return mapper.update(null, new LambdaUpdateWrapper<Moment>()
                .set(Moment::getJournalEntryId, journalId)
                .in(Moment::getId, momentIds)
                .and(scope -> scope.isNull(Moment::getJournalEntryId)
                        .or().eq(Moment::getJournalEntryId, journalId)));
    }

    /** 空串和纯空格都当成「没有」。 */
    private static String blankToNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private void normalize(Moment moment) {
        if (moment.getContent() != null) {
            String content = moment.getContent().trim();
            if (content.length() > MAX_CONTENT_LENGTH)
                throw BusinessException.badRequest("一条随手记不要超过 " + MAX_CONTENT_LENGTH + " 字，写这么多不如直接写日记");
            moment.setContent(content);
        } else {
            moment.setContent("");
        }
        if (StringUtils.hasText(moment.getPlaceName()) && moment.getPlaceName().length() > 120)
            throw BusinessException.badRequest("地点名称不能超过 120 个字符");
        if (StringUtils.hasText(moment.getMood()) && moment.getMood().length() > 40)
            throw BusinessException.badRequest("心情不能超过 40 个字符");
        /*
         * 清空只有一种库内表示：NULL。
         *
         * 前端删光输入框发上来的是空串，不归一的话库里会同时存在 NULL 和 ''，
         * 而 `placeName != null` 这类判断在两者之间的行为完全不同。
         */
        moment.setPlaceName(blankToNull(moment.getPlaceName()));
        moment.setMood(blankToNull(moment.getMood()));
        // 设备定位和 EXIF GPS 按规范都是 WGS84；显式写入元数据，避免数据库默认值或
        // 客户端遗漏让这类新数据以后被当成 GCJ02 再转换。
        if (moment.getLatitude() != null && moment.getLongitude() != null) {
            moment.setCoordinateSystem("WGS84");
        }
        if (moment.getTripStopId() != null) {
            TripStop stop = stopMapper.selectById(moment.getTripStopId());
            if (stop == null || !moment.getTripId().equals(stop.getTripId()))
                throw BusinessException.badRequest("城市不属于当前旅行");
        }
    }

    /** 一次性把城市名和照片查出来，避免每条随手记各查一遍。 */
    private List<MomentView> toViews(List<Moment> moments) {
        if (moments.isEmpty()) return List.of();
        Map<Long, String> cities = stopMapper.selectList(new LambdaQueryWrapper<TripStop>()
                        .in(TripStop::getTripId, moments.stream().map(Moment::getTripId).distinct().toList()))
                .stream().collect(Collectors.toMap(TripStop::getId, TripStop::getCityName, (a, b) -> a));
        Map<Long, List<MomentMedia>> photos = mediaMapper.selectList(new LambdaQueryWrapper<MomentMedia>()
                        .in(MomentMedia::getMomentId, moments.stream().map(Moment::getId).toList())
                        .orderByAsc(MomentMedia::getSortOrder, MomentMedia::getId))
                .stream().collect(Collectors.groupingBy(MomentMedia::getMomentId));
        // 关系是批量查的，资产也要批量查：逐张 viewOf 等于把 N+1 从关系挪到了资产上
        Map<Long, MediaService.MediaView> assetViews = mediaService.viewsOf(
                photos.values().stream().flatMap(List::stream).map(MomentMedia::getMediaAssetId).distinct().toList());
        Function<Moment, List<MediaService.MediaView>> viewsOf = moment ->
                photos.getOrDefault(moment.getId(), List.of()).stream()
                        .map(relation -> assetViews.get(relation.getMediaAssetId()))
                        .filter(java.util.Objects::nonNull).toList();
        return moments.stream().map(moment -> new MomentView(
                moment.getId(), moment.getClientId(), moment.getTripId(), moment.getTripStopId(),
                moment.getTripStopId() == null ? null : cities.get(moment.getTripStopId()),
                moment.getOccurredAt(), moment.getOccurredLocalDate(), moment.getOccurredZoneId(),
                moment.getUtcOffsetMinutes(), moment.getContent(),
                moment.getPlaceName(), moment.getLatitude(), moment.getLongitude(), moment.getMood(),
                moment.getJournalEntryId(), moment.getJournalEntryId() != null, viewsOf.apply(moment))).toList();
    }

    private void normalizeClientId(Moment moment) {
        moment.setClientId(normalizeClientId(moment.getClientId()));
    }

    private String normalizeClientId(String clientId) {
        if (!StringUtils.hasText(clientId)) return null;
        String value = clientId.trim();
        if (value.length() > 80 || !value.matches("[A-Za-z0-9_-]+"))
            throw BusinessException.badRequest("客户端同步标识无效");
        return value;
    }

    /** 将时刻稳定地投影到事情发生地，而不是站点所在时区。 */
    private void normalizeOccurrence(Moment moment) {
        OffsetDateTime occurredAt = moment.getOccurredAt();
        ZoneId zone = null;
        if (StringUtils.hasText(moment.getOccurredZoneId())) {
            try { zone = ZoneId.of(moment.getOccurredZoneId().trim()); }
            catch (Exception ignored) { /* 使用客户端同时提交的 UTC 偏移兜底 */ }
        }
        int offsetMinutes;
        if (zone != null) {
            // IANA 时区是权威来源：服务端按事件时刻重算偏移，夏令时切换也不会留下矛盾数据。
            offsetMinutes = zone.getRules().getOffset(occurredAt.toInstant()).getTotalSeconds() / 60;
        } else {
            offsetMinutes = moment.getUtcOffsetMinutes() == null
                    ? occurredAt.getOffset().getTotalSeconds() / 60 : moment.getUtcOffsetMinutes();
        }
        if (offsetMinutes < -1080 || offsetMinutes > 1080)
            throw BusinessException.badRequest("UTC 偏移超出有效范围");
        if (zone == null) {
            try { zone = ZoneOffset.ofTotalSeconds(offsetMinutes * 60); }
            catch (Exception ignored) { zone = clock.zone(); }
        }
        moment.setOccurredZoneId(zone.getId());
        moment.setUtcOffsetMinutes(offsetMinutes);
        moment.setOccurredLocalDate(occurredAt.atZoneSameInstant(zone).toLocalDate());
    }

    private Trip requireTrip(Long tripId) {
        Trip trip = tripId == null ? null : tripMapper.selectById(tripId);
        if (trip == null) throw BusinessException.badRequest("所属旅行不存在");
        return trip;
    }
}
