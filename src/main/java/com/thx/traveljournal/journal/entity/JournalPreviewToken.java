package com.thx.traveljournal.journal.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.thx.traveljournal.common.entity.BaseEntity;
import lombok.Getter;
import lombok.Setter;

import java.time.OffsetDateTime;

/** 草稿预览令牌，用于在不发布的前提下查看日记在真实站点外壳下的样子。 */
@Getter
@Setter
@TableName("journal_preview_token")
public class JournalPreviewToken extends BaseEntity {
    private Long journalEntryId;
    /** 随机令牌，出现在预览链接里 */
    private String token;
    /** 过期时间，过期后链接失效 */
    private OffsetDateTime expiresAt;
}
