package com.thx.traveljournal.media.mapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.thx.traveljournal.media.entity.JournalMedia;
/**
 * 日记与图片的关联关系，一条记录表示某篇日记引用了某张图片。
 *
 * <p>对应数据库表 {@code journal_media}，基础的增删改查由 MyBatis-Plus 的 BaseMapper 提供。</p>
 */
public interface JournalMediaMapper extends BaseMapper<JournalMedia> {}
