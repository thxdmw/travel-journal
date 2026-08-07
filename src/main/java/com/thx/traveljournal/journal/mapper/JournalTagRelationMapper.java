package com.thx.traveljournal.journal.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.thx.traveljournal.journal.entity.JournalTagRelation;

/**
 * 日记与标签的关联。
 *
 * <p>对应数据库表 {@code journal_tag_relation}。日记或标签被删除时，
 * 关联行由数据库外键的 on delete cascade 自动清理。</p>
 */
public interface JournalTagRelationMapper extends BaseMapper<JournalTagRelation> {}
