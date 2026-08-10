package com.thx.traveljournal.journal.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.thx.traveljournal.common.api.PageResponse;
import com.thx.traveljournal.common.exception.BusinessException;
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
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Set;

/**
 * 日记服务，负责日记的增删改查、发布撤回，以及 Block 文档和媒体归属校验。
 */
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

    @Autowired
    public JournalService(JournalMapper mapper, TripMapper tripMapper, TripStopMapper stopMapper,
                          JournalMediaMapper journalMediaMapper, JournalTemplateMapper templateMapper,
                          MediaService mediaService, JournalDocumentService documentService) {
        this.mapper = mapper;
        this.tripMapper = tripMapper;
        this.stopMapper = stopMapper;
        this.journalMediaMapper = journalMediaMapper;
        this.templateMapper = templateMapper;
        this.mediaService = mediaService;
        this.documentService = documentService;
    }

    /** 单元测试用的简化构造器，不涉及模板和图片存储。 */
    public JournalService(JournalMapper mapper, TripMapper tripMapper, TripStopMapper stopMapper,
                          JournalMediaMapper journalMediaMapper) {
        this(mapper, tripMapper, stopMapper, journalMediaMapper, null, null,
                new JournalDocumentService(new ObjectMapper()));
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
        return PageResponse.of(result.getRecords(), page, pageSize, result.getTotal());
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
        validate(entry, false);
        mapper.insert(entry);
        return entry;
    }

    /**
     * 开一篇空草稿，只要求知道属于哪次旅行。
     *
     * <p>旅行途中打开编辑器就该能立刻拍照和打字，而不是先把标题、slug、日期填完再说。
     * 数据库上这四个字段都是 not null，所以缺的由服务端补默认值：标题空串、slug 自动生成、
     * 日期默认今天。作者随后在「日记信息」里改就行。</p>
     */
    public JournalEntry createDraft(Long tripId, Long tripStopId, LocalDate occurredOn) {
        if (tripId == null) throw BusinessException.badRequest("请先选择所属旅行");
        JournalEntry entry = new JournalEntry();
        entry.setTripId(tripId);
        entry.setTripStopId(tripStopId);
        entry.setOccurredOn(occurredOn == null ? LocalDate.now() : occurredOn);
        entry.setTitle("");
        entry.setSlug(SlugUtils.autoSlug(entry.getOccurredOn()));
        entry.setContentJson(documentService.emptyDocument());
        entry.setStatus("DRAFT");
        entry.setPublishedAt(null);
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
        JournalEntry current = get(id);
        if (!"DRAFT".equals(current.getStatus()))
            throw BusinessException.badRequest("已发布的日记请使用「更新发布」保存");
        input.setId(id);
        input.setStatus("DRAFT");
        input.setPublishedAt(null);
        if (input.getTripId() == null) input.setTripId(current.getTripId());
        if (input.getTitle() == null) input.setTitle(current.getTitle());
        if (!StringUtils.hasText(input.getSlug())) input.setSlug(current.getSlug());
        if (input.getOccurredOn() == null) input.setOccurredOn(current.getOccurredOn());
        if (input.getContentJson() == null) input.setContentJson(current.getContentJson());
        validate(input, false);
        mapper.updateById(input);
        return get(id);
    }

    /**
     * 丢弃一篇什么都没写的草稿，用于「进了编辑器又直接退出」。
     *
     * <p>判空放在服务端，不信任前端传来的状态：只要标题、摘要、正文区块、图片里有任何一样非空，
     * 就当作有内容，原样保留并返回 false。</p>
     *
     * @return 是否真的删掉了
     */
    @Transactional
    public boolean discardIfEmpty(Long id) {
        JournalEntry entry = get(id);
        if (!"DRAFT".equals(entry.getStatus())) return false;
        if (StringUtils.hasText(entry.getTitle()) || StringUtils.hasText(entry.getExcerpt())) return false;
        if (entry.getContentJson() != null && entry.getContentJson().path("blocks").size() > 0) return false;
        if (entry.getCoverMediaId() != null || mediaCount(id) > 0) return false;
        delete(id);
        return true;
    }

    /**
     * 更新日记内容。状态和发布时间保持库里的原值，不受请求体影响；
     * 如果当前是已发布状态，会按发布标准做更严格的校验（例如正文不能为空）。
     */
    public JournalEntry update(Long id, JournalEntry input) {
        JournalEntry entry = get(id);
        String currentStatus = entry.getStatus();
        OffsetDateTime publishedAt = entry.getPublishedAt();
        input.setId(id);
        input.setStatus(currentStatus);
        input.setPublishedAt(publishedAt);
        boolean publishing = "PUBLISHED".equals(currentStatus);
        if (publishing) requirePublishableMeta(input);
        validate(input, publishing);
        mapper.updateById(input);
        return get(id);
    }

    /** 发布日记，记录发布时间。发布后图片才允许被访客访问。 */
    public JournalEntry publish(Long id) {
        JournalEntry entry = get(id);
        requirePublishableMeta(entry);
        validate(entry, true);
        entry.setStatus("PUBLISHED");
        entry.setPublishedAt(OffsetDateTime.now(ZoneOffset.UTC));
        mapper.updateById(entry);
        return entry;
    }

    /** 撤回已发布日记，回到草稿状态，前台立即不可见。 */
    public JournalEntry unpublish(Long id) {
        JournalEntry entry = get(id);
        entry.setStatus("DRAFT");
        entry.setPublishedAt(null);
        mapper.updateById(entry);
        return entry;
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
        Trip trip = tripMapper.selectById(entry.getTripId());
        if (trip == null) throw BusinessException.badRequest("所属旅行不存在");
        // 草稿允许没有 slug：直接补一个，别让作者为了存一句话去想网址
        if (!publishing && !StringUtils.hasText(entry.getSlug()))
            entry.setSlug(SlugUtils.autoSlug(entry.getOccurredOn()));
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
