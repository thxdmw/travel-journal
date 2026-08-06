package com.thx.traveljournal.journaltemplate.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.thx.traveljournal.journaltemplate.entity.JournalTemplate;

/**
 * 日记模板，把常写的结构固定下来，写作时只填当时的天气、心情和故事。
 *
 * <p>对应数据库表 {@code journal_template}，基础的增删改查由 MyBatis-Plus 的 BaseMapper 提供。</p>
 */
public interface JournalTemplateMapper extends BaseMapper<JournalTemplate> {
}
