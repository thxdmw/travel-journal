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

    /**
     * 重命名标签。
     *
     * <p>如果新名字对应的 slug 已经属于另一个标签，就退化成「合并」——
     * 用户输入一个已存在的名字，意图基本就是把两个标签并成一个。</p>
     *
     * @return 最终生效的标签 id（合并时是被并入的那个）
     */
    @Transactional
    public Long rename(Long tagId, String newName) {
        JournalTag tag = require(tagId);
        if (!StringUtils.hasText(newName)) throw BusinessException.badRequest("标签名不能为空");
        String name = newName.trim();
        if (name.length() > MAX_NAME_LENGTH) throw BusinessException.badRequest("标签名不能超过 " + MAX_NAME_LENGTH + " 字");
        String slug = slugOf(name);
        JournalTag conflict = tagMapper.selectOne(new LambdaQueryWrapper<JournalTag>()
                .eq(JournalTag::getSlug, slug).last("limit 1"));
        if (conflict != null && !conflict.getId().equals(tagId)) {
            merge(tagId, conflict.getId());
            return conflict.getId();
        }
        tag.setName(name);
        tag.setSlug(slug);
        tagMapper.updateById(tag);
        return tag.getId();
    }

    /**
     * 把 source 标签并入 target：source 的日记关联全部转到 target，然后删掉 source。
     *
     * <p>转移前要先剔除那些两个标签都打了的日记，否则会撞上
     * {@code uq_journal_tag_relation} 唯一约束。</p>
     */
    @Transactional
    public void merge(Long sourceId, Long targetId) {
        if (sourceId.equals(targetId)) throw BusinessException.badRequest("不能合并到自己");
        require(sourceId);
        require(targetId);
        List<Long> alreadyTagged = relationMapper.selectList(new LambdaQueryWrapper<JournalTagRelation>()
                        .eq(JournalTagRelation::getJournalTagId, targetId))
                .stream().map(JournalTagRelation::getJournalEntryId).toList();
        for (JournalTagRelation relation : relationMapper.selectList(new LambdaQueryWrapper<JournalTagRelation>()
                .eq(JournalTagRelation::getJournalTagId, sourceId))) {
            if (alreadyTagged.contains(relation.getJournalEntryId())) {
                relationMapper.deleteById(relation.getId());   // 两边都有，直接丢掉重复的那条
            } else {
                relation.setJournalTagId(targetId);
                relationMapper.updateById(relation);
            }
        }
        tagMapper.deleteById(sourceId);
    }

    /** 删除标签，连带解除它在所有日记上的关联（外键 cascade 负责关联行）。 */
    @Transactional
    public void delete(Long tagId) {
        require(tagId);
        tagMapper.deleteById(tagId);
    }

    /** 清理没有任何日记引用的标签。日记删多了之后这类空标签会越积越多。 */
    @Transactional
    public int purgeUnused() {
        List<TagView> unused = allTags().stream().filter(view -> view.journalCount() == 0).toList();
        unused.forEach(view -> tagMapper.deleteById(view.id()));
        return unused.size();
    }

    private JournalTag require(Long tagId) {
        JournalTag tag = tagMapper.selectById(tagId);
        if (tag == null) throw BusinessException.notFound("标签不存在");
        return tag;
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
