package com.thx.traveljournal.journal.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.thx.traveljournal.journal.entity.JournalPreviewToken;

/**
 * 草稿预览令牌。
 *
 * <p>对应数据库表 {@code journal_preview_token}。日记被删除时令牌行由外键 cascade 自动清理。</p>
 */
public interface JournalPreviewTokenMapper extends BaseMapper<JournalPreviewToken> {}
