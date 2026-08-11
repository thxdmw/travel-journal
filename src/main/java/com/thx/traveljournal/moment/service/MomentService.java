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
        get(id);
        mediaMapper.delete(new LambdaQueryWrapper<MomentMedia>().eq(MomentMedia::getMomentId, id));
        mapper.deleteById(id);
    }

    /** 给一条随手记加照片。文件本身走 media 模块，这里只建立归属关系。 */
    @Transactional
    public MediaService.MediaView addPhoto(Long momentId, MultipartFile file) {
        return addPhoto(momentId, null, file);
    }

    /** 离线照片上传；同一个 clientId 重放时直接返回第一次上传的图片。 */
    @Transactional
    public MediaService.MediaView addPhoto(Long momentId, String clientId, MultipartFile file) {
        if (mapper.lockMoment(momentId) == null) throw BusinessException.notFound("随手记不存在");
        Moment moment = get(momentId);
        clientId = normalizeClientId(clientId);
        if (clientId != null) {
            MomentMedia existing = mediaMapper.selectOne(new LambdaQueryWrapper<MomentMedia>()
                    .eq(MomentMedia::getMomentId, momentId)
                    .eq(MomentMedia::getClientId, clientId).last("limit 1"));
            if (existing != null) return mediaService.viewOf(existing.getMediaAssetId());
        }
        long count = mediaMapper.selectCount(new LambdaQueryWrapper<MomentMedia>()
                .eq(MomentMedia::getMomentId, momentId));
        if (count >= MAX_PHOTOS) throw BusinessException.badRequest("一条随手记最多 " + MAX_PHOTOS + " 张照片");
        MediaService.MediaView view = mediaService.storeLoose(file,
                "trips/" + moment.getTripId() + "/moments/" + momentId + "/");
        MomentMedia relation = new MomentMedia();
        relation.setMomentId(momentId);
        relation.setClientId(clientId);
        relation.setMediaAssetId(view.id());
        relation.setSortOrder((int) count);
        mediaMapper.insert(relation);
        // 照片带 GPS 而这条随手记还没有位置时，顺手补上——旅行中手动填坐标是不现实的
        if (moment.getLatitude() == null && view.gpsLatitude() != null) {
            moment.setLatitude(view.gpsLatitude());
            moment.setLongitude(view.gpsLongitude());
            mapper.updateById(moment);
        }
        return view;
    }

    /** 从随手记上撤下一张照片。 */
    @Transactional
    public void removePhoto(Long momentId, Long mediaAssetId) {
        get(momentId);
        mediaMapper.delete(new LambdaQueryWrapper<MomentMedia>()
                .eq(MomentMedia::getMomentId, momentId).eq(MomentMedia::getMediaAssetId, mediaAssetId));
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
        Function<Moment, List<MediaService.MediaView>> viewsOf = moment ->
                photos.getOrDefault(moment.getId(), List.of()).stream()
                        .map(relation -> mediaService.viewOf(relation.getMediaAssetId())).toList();
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
