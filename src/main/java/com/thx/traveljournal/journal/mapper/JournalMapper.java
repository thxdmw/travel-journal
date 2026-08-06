package com.thx.traveljournal.journal.mapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.thx.traveljournal.journal.entity.JournalEntry;
/**
 * 旅行日记，前台展示的正文内容。
 *
 * <p>对应数据库表 {@code journal_entry}，基础的增删改查由 MyBatis-Plus 的 BaseMapper 提供。</p>
 */
public interface JournalMapper extends BaseMapper<JournalEntry> {}
