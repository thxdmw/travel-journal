package com.thx.traveljournal.journal.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.thx.traveljournal.common.api.PageResponse;
import com.thx.traveljournal.common.exception.BusinessException;
import com.thx.traveljournal.common.util.SlugUtils;
import com.thx.traveljournal.journal.entity.JournalEntry;
import com.thx.traveljournal.journal.mapper.JournalMapper;
import com.thx.traveljournal.media.entity.JournalMedia;
import com.thx.traveljournal.media.mapper.JournalMediaMapper;
import com.thx.traveljournal.trip.entity.Trip;
import com.thx.traveljournal.trip.entity.TripStop;
import com.thx.traveljournal.trip.mapper.TripMapper;
import com.thx.traveljournal.trip.mapper.TripStopMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class JournalService {
    private static final Pattern MARKDOWN_IMAGE = Pattern.compile(
            "!\\[[^\\]]*]\\(([^\\s)]+)(?:\\s+\"[^\"]*\")?\\)");
    private final JournalMapper mapper;
    private final TripMapper tripMapper;
    private final TripStopMapper stopMapper;
    private final JournalMediaMapper journalMediaMapper;

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
        if (entry.getCoverMediaId() != null) {
            long count = journalMediaMapper.selectCount(new LambdaQueryWrapper<JournalMedia>()
                    .eq(JournalMedia::getJournalEntryId, entry.getId())
                    .eq(JournalMedia::getMediaAssetId, entry.getCoverMediaId()));
            if (entry.getId() != null && count == 0) throw BusinessException.badRequest("封面图片不属于当前日记");
        }
    }

    private void validateMarkdownImages(String markdown) {
        if (!StringUtils.hasText(markdown)) return;
        Matcher matcher = MARKDOWN_IMAGE.matcher(markdown);
        while (matcher.find()) {
            String url = matcher.group(1);
            if (!url.matches("/api/media/\\d+/(display|thumbnail)")) {
                throw BusinessException.badRequest("日记图片必须使用已上传媒体的站内地址");
            }
        }
    }
}
