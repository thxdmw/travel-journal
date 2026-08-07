package com.thx.traveljournal.journal.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.thx.traveljournal.common.exception.BusinessException;
import com.thx.traveljournal.common.util.SlugUtils;
import com.thx.traveljournal.journal.entity.JournalTag;
import com.thx.traveljournal.journal.entity.JournalTagRelation;
import com.thx.traveljournal.journal.mapper.JournalTagMapper;
import com.thx.traveljournal.journal.mapper.JournalTagRelationMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.*;
import java.util.stream.Collectors;

/**
 * 日记标签服务。
 *
 * <p>标签走「按名字自动创建」的模式：编辑日记时直接输入标签名，已存在的复用，
 * 没有的自动建。个人项目里不值得为标签单独做一套管理流程，先用起来更重要。</p>
 */
@Service
@RequiredArgsConstructor
public class JournalTagService {
    /** 单篇日记的标签数上限，防止把标签当关键词堆砌 */
    private static final int MAX_TAGS_PER_JOURNAL = 12;
    private static final int MAX_NAME_LENGTH = 40;

    private final JournalTagMapper tagMapper;
    private final JournalTagRelationMapper relationMapper;

    public record TagView(Long id, String name, String slug, long journalCount) {}

    /** 某篇日记的标签名列表，用于回填编辑器。 */
    public List<String> namesOf(Long journalId) {
        return tagMapper.findByJournal(journalId).stream().map(JournalTag::getName).toList();
    }

    public List<JournalTag> tagsOf(Long journalId) {
        return tagMapper.findByJournal(journalId);
    }

    /** 前台标签云，只统计已发布日记。 */
    public List<TagView> publishedTags() {
        return tagMapper.publishedTagCloud().stream().map(JournalTagService::toView).toList();
    }

    /** 后台标签列表，统计包含草稿。 */
    public List<TagView> allTags() {
        return tagMapper.tagUsage().stream().map(JournalTagService::toView).toList();
    }

    private static TagView toView(Map<String, Object> row) {
        return new TagView(((Number) row.get("id")).longValue(),
                (String) row.get("name"), (String) row.get("slug"),
                ((Number) row.get("journal_count")).longValue());
    }

    /**
     * 把一篇日记的标签整体替换成给定的名字列表。
     *
     * <p>做成「全量替换」而不是增删接口，是因为编辑器那边就是一个标签输入框，
     * 保存时提交当前全部标签，全量替换的语义最直接，也不会出现前后端状态不一致。</p>
     *
     * @param names 标签名，null 表示不改动；空列表表示清空
     */
    @Transactional
    public void replaceTags(Long journalId, List<String> names) {
        if (names == null) return;
        List<String> cleaned = normalize(names);
        if (cleaned.size() > MAX_TAGS_PER_JOURNAL) {
            throw BusinessException.badRequest("单篇日记最多 " + MAX_TAGS_PER_JOURNAL + " 个标签");
        }
        relationMapper.delete(new LambdaQueryWrapper<JournalTagRelation>()
                .eq(JournalTagRelation::getJournalEntryId, journalId));
        for (String name : cleaned) {
            JournalTag tag = findOrCreate(name);
            JournalTagRelation relation = new JournalTagRelation();
            relation.setJournalEntryId(journalId);
            relation.setJournalTagId(tag.getId());
            relationMapper.insert(relation);
        }
    }

    /**
     * 去重、去空白、限长，并保持用户输入的先后顺序。
     *
     * <p>去重按 slug 而不是原文：「温泉」和「温泉 」应该算同一个标签。</p>
     */
    private List<String> normalize(List<String> names) {
        Set<String> seenSlugs = new LinkedHashSet<>();
        List<String> result = new ArrayList<>();
        for (String raw : names) {
            if (!StringUtils.hasText(raw)) continue;
            String name = raw.trim();
            if (name.length() > MAX_NAME_LENGTH) {
                throw BusinessException.badRequest("标签「" + name + "」超过 " + MAX_NAME_LENGTH + " 字");
            }
            if (seenSlugs.add(slugOf(name))) result.add(name);
        }
        return result;
    }

    private JournalTag findOrCreate(String name) {
        String slug = slugOf(name);
        JournalTag existing = tagMapper.selectOne(new LambdaQueryWrapper<JournalTag>()
                .eq(JournalTag::getSlug, slug).last("limit 1"));
        if (existing != null) return existing;
        JournalTag tag = new JournalTag();
        tag.setName(name);
        tag.setSlug(slug);
        tagMapper.insert(tag);
        return tag;
    }

    /**
     * 生成标签 slug。
     *
     * <p>{@link SlugUtils} 会剔除非 ASCII 字符，纯中文标签会被清空，所以这里不能直接用它：
     * 先尝试常规 slug 化，结果为空（纯中文/日文等）时退回按码点生成一个稳定的十六进制串，
     * 保证同名标签永远得到同一个 slug。</p>
     */
    private String slugOf(String name) {
        String ascii = name.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-")
                .replaceAll("^-+|-+$", "");
        if (StringUtils.hasText(ascii)) return ascii.length() > 60 ? ascii.substring(0, 60) : ascii;
        String hex = name.chars().mapToObj(Integer::toHexString).collect(Collectors.joining());
        return "t-" + (hex.length() > 56 ? hex.substring(0, 56) : hex);
    }
}
