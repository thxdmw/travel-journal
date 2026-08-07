package com.thx.traveljournal.journal.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.thx.traveljournal.journal.entity.JournalTag;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * 日记标签。
 *
 * <p>对应数据库表 {@code journal_tag}，基础增删改查由 BaseMapper 提供，
 * 涉及关联表的统计另写 SQL。</p>
 */
public interface JournalTagMapper extends BaseMapper<JournalTag> {

    /** 某篇日记的标签，按名称排序。 */
    @Select("""
        select t.*
          from journal_tag t
          join journal_tag_relation r on r.journal_tag_id = t.id
         where r.journal_entry_id = #{journalId}
         order by t.name
        """)
    List<JournalTag> findByJournal(@Param("journalId") Long journalId);

    /**
     * 前台标签云：只统计已发布日记，没有已发布日记的标签不出现。
     *
     * @return 每行含标签字段和 {@code journal_count}
     */
    @Select("""
        select t.id, t.name, t.slug, count(j.id) as journal_count
          from journal_tag t
          join journal_tag_relation r on r.journal_tag_id = t.id
          join journal_entry j on j.id = r.journal_entry_id and j.status = 'PUBLISHED'
         group by t.id, t.name, t.slug
         order by count(j.id) desc, t.name
        """)
    List<java.util.Map<String, Object>> publishedTagCloud();

    /** 后台标签管理用：统计每个标签被多少篇日记引用（含草稿）。 */
    @Select("""
        select t.id, t.name, t.slug, count(r.id) as journal_count
          from journal_tag t
          left join journal_tag_relation r on r.journal_tag_id = t.id
         group by t.id, t.name, t.slug
         order by t.name
        """)
    List<java.util.Map<String, Object>> tagUsage();
}
