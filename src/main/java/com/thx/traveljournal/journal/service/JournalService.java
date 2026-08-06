package com.thx.traveljournal.journal.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
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
import com.thx.traveljournal.trip.entity.Trip;
import com.thx.traveljournal.trip.entity.TripStop;
import com.thx.traveljournal.trip.mapper.TripMapper;
import com.thx.traveljournal.trip.mapper.TripStopMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class JournalService {
    private static final Pattern MARKDOWN_IMAGE = Pattern.compile(
            "!\\[[^\\]]*]\\(([^\\s)]+)(?:\\s+\"[^\"]*\")?\\)");
    private static final Pattern HTML_IMAGE = Pattern.compile(
            "<img\\s+[^>]*src\\s*=\\s*[\"']([^\"']+)[\"'][^>]*>", Pattern.CASE_INSENSITIVE);
    private final JournalMapper mapper;
    private final TripMapper tripMapper;
    private final TripStopMapper stopMapper;
    private final JournalMediaMapper journalMediaMapper;
    private final JournalTemplateMapper templateMapper;

    @Autowired
    public JournalService(JournalMapper mapper, TripMapper tripMapper, TripStopMapper stopMapper,
                          JournalMediaMapper journalMediaMapper, JournalTemplateMapper templateMapper) {
        this.mapper = mapper;
        this.tripMapper = tripMapper;
        this.stopMapper = stopMapper;
        this.journalMediaMapper = journalMediaMapper;
        this.templateMapper = templateMapper;
    }

    public JournalService(JournalMapper mapper, TripMapper tripMapper, TripStopMapper stopMapper,
                          JournalMediaMapper journalMediaMapper) {
        this(mapper, tripMapper, stopMapper, journalMediaMapper, null);
    }

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

    public JournalEntry get(Long id) {
        JournalEntry entry = mapper.selectById(id);
        if (entry == null) throw BusinessException.notFound("日记不存在");
        return entry;
    }

    public JournalEntry create(JournalEntry entry) {
        entry.setStatus("DRAFT");
        entry.setPublishedAt(null);
        if (entry.getTemplateDetached() == null) entry.setTemplateDetached(false);
        validate(entry, false);
        mapper.insert(entry);
        return entry;
    }

    public JournalEntry update(Long id, JournalEntry input) {
        JournalEntry entry = get(id);
        String currentStatus = entry.getStatus();
        OffsetDateTime publishedAt = entry.getPublishedAt();
        input.setId(id);
        input.setStatus(currentStatus);
        input.setPublishedAt(publishedAt);
        validate(input, "PUBLISHED".equals(currentStatus));
        mapper.updateById(input);
        return get(id);
    }

    public JournalEntry publish(Long id) {
        JournalEntry entry = get(id);
        validate(entry, true);
        entry.setStatus("PUBLISHED");
        entry.setPublishedAt(OffsetDateTime.now(ZoneOffset.UTC));
        mapper.updateById(entry);
        return entry;
    }

    public JournalEntry unpublish(Long id) {
        JournalEntry entry = get(id);
        entry.setStatus("DRAFT");
        entry.setPublishedAt(null);
        mapper.updateById(entry);
        return entry;
    }

    @Transactional
    public void delete(Long id) {
        JournalEntry entry = get(id);
        if ("PUBLISHED".equals(entry.getStatus())) throw BusinessException.conflict("请先撤回已发布日记");
        long mediaCount = journalMediaMapper.selectCount(new LambdaQueryWrapper<JournalMedia>()
                .eq(JournalMedia::getJournalEntryId, id));
        if (mediaCount > 0) throw BusinessException.conflict("请先删除日记中的图片");
        mapper.deleteById(id);
    }

    private void validate(JournalEntry entry, boolean publishing) {
        Trip trip = tripMapper.selectById(entry.getTripId());
        if (trip == null) throw BusinessException.badRequest("所属旅行不存在");
        entry.setSlug(SlugUtils.normalize(entry.getSlug()));
        if (entry.getTripStopId() != null) {
            TripStop stop = stopMapper.selectById(entry.getTripStopId());
            if (stop == null || !entry.getTripId().equals(stop.getTripId())) throw BusinessException.badRequest("城市不属于当前旅行");
        }
        if (publishing && !StringUtils.hasText(entry.getContentMarkdown())) {
            throw BusinessException.badRequest("发布前必须填写日记正文");
        }
        validateMarkdownImages(entry.getContentMarkdown());
        validateTemplate(entry);
        if (entry.getCoverMediaId() != null) {
            long count = journalMediaMapper.selectCount(new LambdaQueryWrapper<JournalMedia>()
                    .eq(JournalMedia::getJournalEntryId, entry.getId())
                    .eq(JournalMedia::getMediaAssetId, entry.getCoverMediaId()));
            if (entry.getId() != null && count == 0) throw BusinessException.badRequest("封面图片不属于当前日记");
        }
    }

    private void validateMarkdownImages(String markdown) {
        if (!StringUtils.hasText(markdown)) return;
        validateImageMatches(MARKDOWN_IMAGE.matcher(markdown));
        validateImageMatches(HTML_IMAGE.matcher(markdown));
    }

    private void validateImageMatches(Matcher matcher) {
        while (matcher.find()) {
            String url = matcher.group(1);
            if (!url.matches("/api/media/\\d+/(display|thumbnail)")) {
                throw BusinessException.badRequest("日记图片必须使用已上传媒体的站内地址");
            }
        }
    }

    private void validateTemplate(JournalEntry entry) {
        if (entry.getTemplateId() == null) {
            entry.setTemplateVersion(null);
            entry.setTemplateData(null);
            entry.setTemplateSnapshot(null);
            entry.setTemplateDetached(false);
            return;
        }
        JournalTemplate template = templateMapper == null ? null : templateMapper.selectById(entry.getTemplateId());
        if (template == null) throw BusinessException.badRequest("日记模板不存在");
        if (entry.getTemplateVersion() == null) entry.setTemplateVersion(template.getVersion());
        if (entry.getTemplateSnapshot() == null) entry.setTemplateSnapshot(template.getDefinitionJson().deepCopy());
        if (entry.getTemplateData() != null && !entry.getTemplateData().isObject())
            throw BusinessException.badRequest("模板填写数据格式不正确");
        if (entry.getTemplateSnapshot() != null && !entry.getTemplateSnapshot().isObject())
            throw BusinessException.badRequest("模板快照格式不正确");
        if (entry.getTemplateDetached() == null) entry.setTemplateDetached(false);
    }
}
