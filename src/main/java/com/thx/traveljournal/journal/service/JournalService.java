package com.thx.traveljournal.journal.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.thx.traveljournal.common.api.PageResponse;
import com.thx.traveljournal.common.exception.BusinessException;
import com.thx.traveljournal.common.util.SiteClock;
import com.thx.traveljournal.common.util.SlugUtils;
import com.thx.traveljournal.journal.entity.JournalEntry;
import com.thx.traveljournal.journal.mapper.JournalMapper;
import com.thx.traveljournal.journaltemplate.entity.JournalTemplate;
import com.thx.traveljournal.journaltemplate.mapper.JournalTemplateMapper;
import com.thx.traveljournal.media.entity.JournalMedia;
import com.thx.traveljournal.media.mapper.JournalMediaMapper;
import com.thx.traveljournal.media.service.MediaService;
import com.thx.traveljournal.trip.entity.Trip;
import com.thx.traveljournal.trip.entity.TripStop;
import com.thx.traveljournal.trip.mapper.TripMapper;
import com.thx.traveljournal.trip.mapper.TripStopMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 日记服务，负责日记的增删改查、发布撤回，以及 Block 文档和媒体归属校验。
 */
@Slf4j
@Service
public class JournalService {
    private final JournalMapper mapper;
    private final TripMapper tripMapper;
    private final TripStopMapper stopMapper;
    private final JournalMediaMapper journalMediaMapper;
    private final JournalTemplateMapper templateMapper;
    private final JournalDocumentService documentService;
    /** 删除日记时用来级联清理图片；单元测试用简化构造器时为 null，此时跳过图片清理。 */
    private final MediaService mediaService;
    private final SiteClock clock;
    private final JournalTagService tagService;

    @Autowired
    public JournalService(JournalMapper mapper, TripMapper tripMapper, TripStopMapper stopMapper,
                          JournalMediaMapper journalMediaMapper, JournalTemplateMapper templateMapper,
                          MediaService mediaService, JournalDocumentService documentService,
                          SiteClock clock, JournalTagService tagService) {
        this.mapper = mapper;
        this.tripMapper = tripMapper;
        this.stopMapper = stopMapper;
        this.journalMediaMapper = journalMediaMapper;
        this.templateMapper = templateMapper;
        this.mediaService = mediaService;
        this.documentService = documentService;
        this.clock = clock;
        this.tagService = tagService;
    }

    /** 单元测试用的简化构造器，不涉及模板和图片存储。 */
    public JournalService(JournalMapper mapper, TripMapper tripMapper, TripStopMapper stopMapper,
                          JournalMediaMapper journalMediaMapper) {
        this(mapper, tripMapper, stopMapper, journalMediaMapper, null, null,
                new JournalDocumentService(new ObjectMapper()), new SiteClock(null), null);
    }

    /**
     * 一次草稿部分更新里，请求究竟提到了哪些字段。
     *
     * <p>PATCH 的「没传」和「显式传了 null」是两件完全不同的事：前者要沿用库里的旧值，
     * 后者是作者把封面撤了、把摘要清空了。record 绑定完就分不出这两者，所以字段名集合
     * 必须从原始 JSON 上单独取一份带下来。</p>
     *
     * @param present          请求体里真正出现过的字段名
     * @param detachFromTrip   是否明确解除旅行归属
     * @param expectedRevision 客户端手上那份的版本号；为空表示不做并发检查（老客户端）
     */
    public record DraftPatch(Set<String> present, boolean detachFromTrip, Integer expectedRevision) {
        public DraftPatch {
            present = present == null ? Set.of() : Set.copyOf(present);
        }

        public DraftPatch(Set<String> present, boolean detachFromTrip) {
            this(present, detachFromTrip, null);
        }

        /** 请求提到过这个字段吗。 */
        public boolean has(String field) { return present.contains(field); }

        /** 兼容旧调用：把所有字段都当成已出现，等价于全量覆盖。 */
        public static DraftPatch all(boolean detachFromTrip) {
            return new DraftPatch(Set.of("tripId", "tripStopId", "title", "slug", "excerpt", "contentJson",
                    "occurredOn", "coverMediaId", "themeKey", "templateId", "templateVersion"), detachFromTrip);
        }
    }

    /**
     * 后台日记分页列表。
     *
     * @param tripId  按所属旅行过滤，为空表示不限
     * @param status  按 DRAFT / PUBLISHED 过滤，为空表示不限
     * @param keyword 在标题和摘要里模糊匹配
     */
    public PageResponse<JournalEntry> list(long page, long pageSize, Long tripId, String status, String keyword) {
        LambdaQueryWrapper<JournalEntry> query = new LambdaQueryWrapper<JournalEntry>()
                .eq(tripId != null, JournalEntry::getTripId, tripId)
                .eq(StringUtils.hasText(status), JournalEntry::getStatus, status)
                .and(StringUtils.hasText(keyword), q -> q.like(JournalEntry::getTitle, keyword)
                        .or().like(JournalEntry::getExcerpt, keyword))
                .orderByDesc(JournalEntry::getUpdatedAt);
        Page<JournalEntry> result = mapper.selectPage(Page.of(page, pageSize), query);
        fillTripTitles(result.getRecords());
        return PageResponse.of(result.getRecords(), page, pageSize, result.getTotal());
    }

    /** 一次查完这一页涉及的旅行标题，不按篇数逐条查旅行。 */
    private void fillTripTitles(List<JournalEntry> entries) {
        Set<Long> tripIds = entries.stream().map(JournalEntry::getTripId)
                .filter(java.util.Objects::nonNull).collect(Collectors.toSet());
        if (tripIds.isEmpty()) return;
        java.util.Map<Long, String> titles = tripMapper.selectList(new LambdaQueryWrapper<Trip>()
                        .select(Trip::getId, Trip::getTitle).in(Trip::getId, tripIds))
                .stream().collect(Collectors.toMap(Trip::getId, Trip::getTitle));
        entries.forEach(entry -> entry.setTripTitle(titles.get(entry.getTripId())));
    }

    /*
     * ============================================================ 日记 + 标签
     *
     * 正文和标签是两次写库，以前分别由 Controller 依次调用：正文写成功、标签写失败时
     * 会留下一个「内容改了但标签没改」的中间态，而前端收到的是一个错误响应，作者根本
     * 不知道哪一半生效了。事务编排收进服务层，两者要么一起成功，要么一起回滚。
     */

    /** 新建日记并写入标签，同一个事务。 */
    @Transactional
    public JournalEntry createWithTags(JournalEntry entry, List<String> tags) {
        JournalEntry created = create(entry);
        tagService.replaceTags(created.getId(), tags);
        created.setTags(tagService.namesOf(created.getId()));
        return created;
    }

    /** 全量更新日记并替换标签，同一个事务。 */
    @Transactional
    public JournalEntry updateWithTags(Long id, JournalEntry input, List<String> tags) {
        return updateWithTags(id, input, tags, null);
    }

    /** 全量更新日记并替换标签，同一个事务，带乐观并发检查。 */
    @Transactional
    public JournalEntry updateWithTags(Long id, JournalEntry input, List<String> tags, Integer expectedRevision) {
        JournalEntry updated = update(id, input, expectedRevision);
        tagService.replaceTags(id, tags);
        updated.setTags(tagService.namesOf(id));
        return updated;
    }

    /** 保存草稿并按需替换标签，同一个事务。{@code tags} 为 null 表示不动标签。 */
    @Transactional
    public JournalEntry updateDraftWithTags(Long id, JournalEntry input, DraftPatch patch, List<String> tags) {
        JournalEntry updated = updateDraft(id, input, patch);
        if (tags != null) tagService.replaceTags(id, tags);
        updated.setTags(tagService.namesOf(id));
        return updated;
    }

    /** 按 id 查询日记，不存在时抛 404。 */
    public JournalEntry get(Long id) {
        JournalEntry entry = mapper.selectById(id);
        if (entry == null) throw BusinessException.notFound("日记不存在");
        return entry;
    }

    /** 新建日记。无论前端传什么状态，新建的一律是草稿，发布必须走 {@link #publish}。 */
    public JournalEntry create(JournalEntry entry) {
        entry.setStatus("DRAFT");
        entry.setPublishedAt(null);
        // 版本号显式写 0 而不是靠数据库默认值：insert 只会把自增 id 回填到实体上，
        // 缺了它返回给前端的这份就没有 revision，下一次保存自然也带不上版本号
        entry.setRevision(0);
        validate(entry, false);
        mapper.insert(entry);
        return entry;
    }

    /**
     * 开一篇空草稿。旅行是可选归属：从旅行工作台进入时带上，直接写日记时可以为空。
     *
     * <p>旅行途中开始写就该能立刻拍照和打字，而不是先把标题、slug、日期填完再说。
     * 数据库上这四个字段都是 not null，所以缺的由服务端补默认值：标题空串、slug 自动生成、
     * 日期默认今天。作者随后在「日记信息」里改就行。</p>
     */
    public JournalEntry createDraft(Long tripId, Long tripStopId, LocalDate occurredOn) {
        JournalEntry entry = new JournalEntry();
        entry.setTripId(tripId);
        entry.setTripStopId(tripStopId);
        // 「今天」必须由站点时钟回答：容器时区和访客时区都不该决定这篇日记落在哪一天
        entry.setOccurredOn(occurredOn == null ? clock.today() : occurredOn);
        entry.setTitle("");
        entry.setSlug(SlugUtils.autoSlug(entry.getOccurredOn()));
        entry.setContentJson(documentService.emptyDocument());
        entry.setStatus("DRAFT");
        entry.setPublishedAt(null);
        // 同 create：insert 不回填数据库默认值，编辑器拿到的第一份必须已经带着版本号，
        // 否则它的第一次自动保存就没有并发保护可用
        entry.setRevision(0);
        validate(entry, false);
        mapper.insert(entry);
        return entry;
    }

    /**
     * 自动保存草稿。请求体里任何字段都可以缺席，缺的沿用库里的旧值。
     *
     * <p>和 {@link #update} 的区别是这条路径永远按草稿标准校验：允许空标题、空正文。
     * 已发布的日记不走这里——公开内容只能由「更新发布」显式改变。</p>
     */
    public JournalEntry updateDraft(Long id, JournalEntry input) {
        return updateDraft(id, input, false);
    }

    /**
     * 草稿部分更新。{@code detachFromTrip} 用来区分“请求没传 tripId”和“作者明确清空旅行”。
     */
    public JournalEntry updateDraft(Long id, JournalEntry input, boolean detachFromTrip) {
        return updateDraft(id, input, DraftPatch.all(detachFromTrip));
    }

    /**
     * 草稿部分更新，按请求真正提到的字段决定「沿用旧值」还是「写成 NULL」。
     *
     * <p>清空这件事以前是做不到的：把字段 set 成 null 再 {@code updateById}，MyBatis-Plus
     * 默认策略会直接跳过这一列，于是界面上封面没了、旅行解除了，库里却原样躺着。</p>
     */
    public JournalEntry updateDraft(Long id, JournalEntry input, DraftPatch patch) {
        JournalEntry current = get(id);
        if (!"DRAFT".equals(current.getStatus()))
            throw BusinessException.badRequest("已发布的日记请使用「更新发布」保存");
        input.setId(id);
        input.setStatus("DRAFT");
        input.setPublishedAt(null);
        Set<String> clear = new LinkedHashSet<>();
        applyTripPatch(input, current, patch, clear);
        if (!patch.has("coverMediaId")) input.setCoverMediaId(current.getCoverMediaId());
        else if (input.getCoverMediaId() == null) clear.add("cover_media_id");
        if (!patch.has("excerpt")) input.setExcerpt(current.getExcerpt());
        else if (input.getExcerpt() == null) clear.add("excerpt");
        // 这三列声明的是 FieldStrategy.ALWAYS，缺席时必须显式补回旧值，否则会被写成 NULL
        if (!patch.has("themeKey")) input.setThemeKey(current.getThemeKey());
        if (!patch.has("templateId")) {
            input.setTemplateId(current.getTemplateId());
            input.setTemplateVersion(current.getTemplateVersion());
        }
        if (input.getTitle() == null) input.setTitle(current.getTitle());
        if (!StringUtils.hasText(input.getSlug())) input.setSlug(current.getSlug());
        if (input.getOccurredOn() == null) input.setOccurredOn(current.getOccurredOn());
        if (input.getContentJson() == null) input.setContentJson(current.getContentJson());
        validate(input, false);
        // status 条件不能少：并发的「发布」如果先一步成功，这次保存必须失败，
        // 否则会把刚发布的文章连同 published_at 一起写回草稿
        writeBack(input, clear, patch.expectedRevision(), "DRAFT");
        return get(id);
    }

    /**
     * 旅行归属的部分更新。
     *
     * <p>换一场旅行时旧城市必须跟着走：它属于上一场旅行，留着就是一条「城市不属于当前旅行」
     * 的脏数据，下一次保存会被校验直接拒掉。</p>
     */
    private void applyTripPatch(JournalEntry input, JournalEntry current, DraftPatch patch, Set<String> clear) {
        if (patch.detachFromTrip()) {
            input.setTripId(null);
            input.setTripStopId(null);
            clear.add("trip_id");
            clear.add("trip_stop_id");
            return;
        }
        boolean tripGiven = patch.has("tripId");
        if (!tripGiven) input.setTripId(current.getTripId());
        else if (input.getTripId() == null) clear.add("trip_id");
        boolean tripChanged = input.getTripId() == null
                ? current.getTripId() != null
                : !input.getTripId().equals(current.getTripId());
        if (patch.has("tripStopId")) {
            if (input.getTripStopId() == null) clear.add("trip_stop_id");
        } else if (tripChanged) {
            input.setTripStopId(null);
            clear.add("trip_stop_id");
        } else {
            input.setTripStopId(current.getTripStopId());
        }
    }

    /**
     * 把实体写回数据库，并让 {@code clear} 里的列真正落成 NULL。
     *
     * <p>MyBatis-Plus 的默认更新策略会跳过 null 字段——这对「请求没提到的字段」是对的，
     * 对「作者明确清空的字段」就是静默丢弃。要清的列只能显式 set 出来。</p>
     */
    private void writeBack(JournalEntry entry, Collection<String> clear) {
        writeBack(entry, clear, null, null);
    }

    /**
     * 带乐观并发检查的写回。日记的每一次写入都必须走这里。
     *
     * <p>两道条件缺一不可：</p>
     *
     * <p>{@code expectedRevision} 非空时 UPDATE 带上 {@code revision = ?} 并原子加一。两个
     * 标签页拿着同一个版本同时保存，只有先到的那个能改动行；后到的影响行数是 0，直接 409，
     * 而不是把对方刚写的那段正文盖掉。</p>
     *
     * <p>{@code expectedStatus} 是另一半，而且是更要命的那一半。以前发布走的是不带任何条件的
     * {@code updateById}，既不看版本也不递增它，于是「读到 DRAFT 版本 10 → 另一边发布成功
     * 但版本还是 10 → 自动保存的 CAS 照样匹配」——而草稿保存又会把 status 写回 DRAFT、把
     * published_at 抹掉。那不是概率性覆盖，是必然的数据损坏。状态转换和正文保存必须用同一套
     * 并发协议，条件里就得有 status。</p>
     *
     * <p>所以即使调用方没带版本号（老客户端、脚本），只要给了 {@code expectedStatus}，
     * 状态被人改过的写入依然会被挡下来。</p>
     */
    private void writeBack(JournalEntry entry, Collection<String> clear,
                           Integer expectedRevision, String expectedStatus) {
        boolean guardRevision = expectedRevision != null;
        boolean guardStatus = expectedStatus != null;
        if (!guardRevision && !guardStatus && (clear == null || clear.isEmpty())) {
            mapper.updateById(entry);
            return;
        }
        UpdateWrapper<JournalEntry> wrapper = new UpdateWrapper<>();
        wrapper.eq("id", entry.getId());
        if (clear != null) clear.forEach(column -> wrapper.set(column, null));
        if (guardStatus) wrapper.eq("status", expectedStatus);
        if (guardRevision) wrapper.eq("revision", expectedRevision);
        if (guardRevision || guardStatus) {
            /*
             * 版本号只能由这里的 setSql 赋值一次。
             *
             * 实体上的非 null 字段都会被 MyBatis-Plus 生成一列 SET，发布和撤回传进来的
             * 实体是从库里读出来的，revision 带着值——那样一条 UPDATE 里就会同时出现
             * revision=? 和 revision = revision + 1，PostgreSQL 直接拒绝：
             * multiple assignments to same column。置空让实体这一列被跳过。
             *
             * 调用方随后都会 get(id) 重新读，不受这次置空影响。
             */
            entry.setRevision(null);
            // 状态转换也要推进版本号，否则并发的自动保存拿着旧版本仍然能匹配上
            wrapper.setSql("revision = revision + 1");
        }
        int affected = mapper.update(entry, wrapper);
        if ((guardRevision || guardStatus) && affected == 0) {
            throw BusinessException.conflict("这篇日记在别处已经被改过（内容或发布状态），请刷新后重试");
        }
    }

    /**
     * 丢弃一篇什么都没写的草稿，用于作者显式放弃。
     *
     * <p>判空放在服务端，不信任前端传来的状态：只要标题、摘要、正文区块、图片里有任何一样非空，
     * 就当作有内容，原样保留并返回 false。</p>
     *
     * @return 是否真的删掉了
     */
    @Transactional
    public boolean discardIfEmpty(Long id) {
        JournalEntry entry = get(id);
        if (!isEmptyDraft(entry)) return false;
        delete(id);
        return true;
    }

    /**
     * 回收放了很久仍然一片空白的草稿。
     *
     * <p>新建页现在先把草稿攒在本地，等真的写了点什么才落一篇服务端草稿，所以空记录
     * 已经少了很多；但从旅行工作台开日记、以及各种半途而废的路径仍然会留下空草稿。
     * 退出时立刻删是不行的：退出瞬间最后一次自动保存可能还在路上，服务端此刻看到的
     * 空正文并不代表作者真的什么都没写——删错一篇正文的代价远高于库里多留一条空记录。
     * 所以改成过了静默期再收，期间作者随时可能回来接着写。</p>
     *
     * @param quietFor 最后一次更新之后至少要静默多久才回收
     * @return 实际清理掉的条数
     */
    public List<Long> staleEmptyDraftIds(Duration quietFor) {
        // 纯 Duration 规则，和站点自然日无关：滚动 24 小时里作者随时可能回来接着写
        OffsetDateTime deadline = purgeDeadline(quietFor);
        List<JournalEntry> candidates = mapper.selectList(new LambdaQueryWrapper<JournalEntry>()
                .eq(JournalEntry::getStatus, "DRAFT")
                .lt(JournalEntry::getUpdatedAt, deadline));
        if (candidates.isEmpty()) return List.of();
        // 先按正文判空，只有还看不出结论的那些才需要问图片；一次问完，不按篇数发查询
        List<JournalEntry> textEmpty = candidates.stream().filter(this::isTextEmptyDraft).toList();
        Set<Long> withMedia = journalIdsWithMedia(textEmpty.stream().map(JournalEntry::getId).toList());
        return textEmpty.stream()
                .filter(entry -> entry.getCoverMediaId() == null && !withMedia.contains(entry.getId()))
                .map(JournalEntry::getId)
                .toList();
    }

    /**
     * 回收超过静默期仍然空白的草稿。
     *
     * <p>一篇删不掉不该拖累其余：清理是尽力而为的后台任务，跳过这一篇，下一轮还会再来。
     * 生产路径由 {@link EmptyDraftCleaner} 逐篇调用 {@link #delete}，那样每篇各自一个事务。</p>
     *
     * @param quietFor 最后一次更新之后至少要静默多久才回收
     * @return 实际清理掉的条数
     */
    public int purgeStaleEmptyDrafts(Duration quietFor) {
        OffsetDateTime deadline = purgeDeadline(quietFor);
        int removed = 0;
        for (Long id : staleEmptyDraftIds(quietFor)) {
            try {
                if (deleteIfStillStaleEmpty(id, deadline)) removed++;
            } catch (Exception e) {
                log.warn("回收空白草稿 {} 失败，本轮跳过", id, e);
            }
        }
        return removed;
    }

    /**
     * 锁住这一行，再确认一次它仍然该被回收，然后才删。
     *
     * <p>{@link #staleEmptyDraftIds} 给出的只是候选。从「扫描时判定为空」到「真正执行删除」
     * 之间隔着整整一轮循环，作者完全可能在这个窗口里回来接着写：</p>
     *
     * <pre>
     * 10:00:00  定时任务判定草稿 123 是空的
     * 10:00:01  作者打开它，写了两段，自动保存成功
     * 10:00:02  Cleaner 删掉 123        ← 刚写的东西没了
     * </pre>
     *
     * <p>删错一篇正文的代价远高于库里多留一天的空记录，所以判空和删除必须在同一个事务里，
     * 而且要先把行锁住——否则复查和删除之间又是一个新的窗口。</p>
     *
     * @return 是否真的删掉了；因为不再符合条件而跳过时返回 false
     */
    @Transactional
    public boolean deleteIfStillStaleEmpty(Long id, OffsetDateTime deadline) {
        JournalEntry entry = mapper.selectOne(new QueryWrapper<JournalEntry>()
                .eq("id", id).last("for update"));
        if (entry == null) return false;
        // 期间被发布了、被改过了、或者作者刚写了点什么，都不再回收
        if (entry.getUpdatedAt() == null || !entry.getUpdatedAt().isBefore(deadline)) return false;
        if (!isEmptyDraft(entry)) return false;
        delete(id);
        return true;
    }

    /**
     * 回收边界：最后一次更新早于这个时刻的草稿才动。
     *
     * <p>这是一条纯 Duration 规则，刻意不走 {@link SiteClock}——「今天之前」或者站点自然日
     * 零点都会让下午写的草稿在几小时后就被删掉。判断依据是 {@code updatedAt} 而不是
     * {@code createdAt}：昨天开的草稿只要今天又改过，它就还活着。</p>
     */
    static OffsetDateTime purgeDeadline(Duration quietFor) {
        return OffsetDateTime.now(ZoneOffset.UTC).minus(quietFor);
    }

    /** 这些日记里哪几篇挂着图片。一次 group by 查完，不按篇数发查询。 */
    private Set<Long> journalIdsWithMedia(Collection<Long> ids) {
        if (ids.isEmpty()) return Set.of();
        List<JournalMedia> relations = journalMediaMapper.selectList(new QueryWrapper<JournalMedia>()
                .select("DISTINCT journal_entry_id")
                .in("journal_entry_id", ids));
        return relations.stream().map(JournalMedia::getJournalEntryId).collect(Collectors.toSet());
    }

    /** 一篇草稿是否连一个字、一张图都没有。封面和图片也算内容。 */
    private boolean isEmptyDraft(JournalEntry entry) {
        return isTextEmptyDraft(entry) && entry.getCoverMediaId() == null && mediaCount(entry.getId()) == 0;
    }

    /** 只看文字部分是否为空，图片留给批量查询回答。 */
    private boolean isTextEmptyDraft(JournalEntry entry) {
        if (!"DRAFT".equals(entry.getStatus())) return false;
        if (StringUtils.hasText(entry.getTitle()) || StringUtils.hasText(entry.getExcerpt())) return false;
        return entry.getContentJson() == null || entry.getContentJson().path("blocks").size() <= 0;
    }

    /**
     * 更新日记内容。状态和发布时间保持库里的原值，不受请求体影响；
     * 如果当前是已发布状态，会按发布标准做更严格的校验（例如正文不能为空）。
     */
    public JournalEntry update(Long id, JournalEntry input) {
        return update(id, input, null);
    }

    /** 全量更新，带乐观并发检查。{@code expectedRevision} 为空表示只校验状态没被改过。 */
    public JournalEntry update(Long id, JournalEntry input, Integer expectedRevision) {
        JournalEntry entry = get(id);
        String currentStatus = entry.getStatus();
        OffsetDateTime publishedAt = entry.getPublishedAt();
        input.setId(id);
        input.setStatus(currentStatus);
        input.setPublishedAt(publishedAt);
        boolean publishing = "PUBLISHED".equals(currentStatus);
        if (publishing) requirePublishableMeta(input);
        validate(input, publishing);
        // PUT 是全量覆盖：请求里没有的可选字段就是作者把它清掉了
        Set<String> clear = new LinkedHashSet<>();
        if (input.getTripId() == null) clear.add("trip_id");
        if (input.getTripStopId() == null) clear.add("trip_stop_id");
        if (input.getCoverMediaId() == null) clear.add("cover_media_id");
        if (input.getExcerpt() == null) clear.add("excerpt");
        writeBack(input, clear, expectedRevision, currentStatus);
        return get(id);
    }

    /** 发布日记，记录发布时间。发布后图片才允许被访客访问。 */
    public JournalEntry publish(Long id) {
        return publish(id, null);
    }

    /**
     * 发布日记，记录发布时间。发布后图片才允许被访客访问。
     *
     * <p>只有仍是草稿的日记才能发布：条件里带 {@code status = 'DRAFT'}，重复点击发布
     * 或者与撤回撞车时，第二个请求得到 409 而不是覆盖出一个错乱的状态。</p>
     */
    public JournalEntry publish(Long id, Integer expectedRevision) {
        JournalEntry entry = get(id);
        requirePublishableMeta(entry);
        validate(entry, true);
        entry.setStatus("PUBLISHED");
        entry.setPublishedAt(OffsetDateTime.now(ZoneOffset.UTC));
        writeBack(entry, Set.of(), expectedRevision, "DRAFT");
        return get(id);
    }

    /** 撤回已发布日记，回到草稿状态，前台立即不可见。 */
    public JournalEntry unpublish(Long id) {
        return unpublish(id, null);
    }

    /** 撤回已发布日记，回到草稿状态，前台立即不可见。只有已发布的才能撤回。 */
    public JournalEntry unpublish(Long id, Integer expectedRevision) {
        JournalEntry entry = get(id);
        entry.setStatus("DRAFT");
        entry.setPublishedAt(null);
        // published_at 要真的写成 NULL，默认更新策略会跳过 null 字段
        writeBack(entry, Set.of("published_at"), expectedRevision, "PUBLISHED");
        return get(id);
    }

    /**
     * 删除日记，并级联清理它的全部关联数据。
     *
     * <p>已发布的日记也可以直接删除，不必先撤回；日记下的图片（包含被设为封面的那张）
     * 会连同对象存储文件一起删掉，是否二次确认由前端负责提示。</p>
     *
     * @return 一并删除的图片张数，用于前端提示
     */
    @Transactional
    public int delete(Long id) {
        get(id);
        // 先清图片：journal_media 关系、media_asset 记录和 MinIO 文件都在这一步处理，
        // 顺带把指向这些图片的日记封面、旅行封面引用置空。
        int removedMedia = mediaService == null ? 0 : mediaService.purgeJournalMedia(id);
        mapper.deleteById(id);
        return removedMedia;
    }

    /** 统计日记下的图片张数，供前端在删除确认弹窗里提示「将同时删除 N 张图片」。 */
    public long mediaCount(Long id) {
        return journalMediaMapper.selectCount(new QueryWrapper<JournalMedia>()
                .eq("journal_entry_id", id));
    }

    /**
     * 发布前的元信息门槛。
     *
     * <p>草稿阶段这些都可以空着——写的时候不该被表单拦住；但公开出去的文章必须有标题和日期，
     * 否则前台列表和归档都无从展示。</p>
     */
    private void requirePublishableMeta(JournalEntry entry) {
        if (!StringUtils.hasText(entry.getTitle())) throw BusinessException.badRequest("发布前请填写日记标题");
        if (entry.getOccurredOn() == null) throw BusinessException.badRequest("发布前请选择日记发生日期");
        if (!StringUtils.hasText(entry.getSlug())) throw BusinessException.badRequest("发布前请填写 Slug");
    }

    /**
     * 校验日记数据。
     *
     * @param publishing 是否按发布标准校验；发布时正文不能为空，草稿允许空正文和空标题
     */
    private void validate(JournalEntry entry, boolean publishing) {
        if (entry.getTripId() != null) {
            Trip trip = tripMapper.selectById(entry.getTripId());
            if (trip == null) throw BusinessException.badRequest("所属旅行不存在");
        } else if (entry.getTripStopId() != null) {
            throw BusinessException.badRequest("未选择旅行时不能选择所属城市");
        }
        // 草稿允许没有 slug：直接补一个，别让作者为了存一句话去想网址
        if (!publishing && !StringUtils.hasText(entry.getSlug()))
            // 日期缺席时用站点时钟补，别让 SlugUtils 退回到容器的默认时区
            entry.setSlug(SlugUtils.autoSlug(entry.getOccurredOn() == null ? clock.today() : entry.getOccurredOn()));
        entry.setSlug(SlugUtils.normalize(entry.getSlug()));
        if (entry.getTripStopId() != null) {
            TripStop stop = stopMapper.selectById(entry.getTripStopId());
            if (stop == null || !entry.getTripId().equals(stop.getTripId())) throw BusinessException.badRequest("城市不属于当前旅行");
        }
        entry.setContentJson(documentService.validate(entry.getContentJson(), publishing));
        validateDocumentMedia(entry);
        validateTemplate(entry);
        if (entry.getCoverMediaId() != null) {
            long count = journalMediaMapper.selectCount(new QueryWrapper<JournalMedia>()
                    .eq("journal_entry_id", entry.getId())
                    .eq("media_asset_id", entry.getCoverMediaId()));
            if (entry.getId() != null && count == 0) throw BusinessException.badRequest("封面图片不属于当前日记");
        }
    }

    /** Block 只保存媒体 id；这里保证它们确实属于当前日记。 */
    private void validateDocumentMedia(JournalEntry entry) {
        Set<Long> mediaIds = documentService.mediaIds(entry.getContentJson());
        if (mediaIds.isEmpty()) return;
        if (entry.getId() == null) throw BusinessException.badRequest("请先保存草稿，再插入图片");
        long count = journalMediaMapper.selectCount(new QueryWrapper<JournalMedia>()
                .eq("journal_entry_id", entry.getId())
                .in("media_asset_id", mediaIds));
        if (count != mediaIds.size()) throw BusinessException.badRequest("正文包含不属于当前日记的图片");
    }

    /** 模板只记录正文最初来自哪个蓝图；实例化以后 Block 文档独立编辑。 */
    private void validateTemplate(JournalEntry entry) {
        if (entry.getTemplateId() == null) {
            entry.setTemplateVersion(null);
            return;
        }
        JournalTemplate template = templateMapper == null ? null : templateMapper.selectById(entry.getTemplateId());
        if (template == null) throw BusinessException.badRequest("日记模板不存在");
        if (entry.getTemplateVersion() == null) entry.setTemplateVersion(template.getVersion());
    }
}
