package com.thx.traveljournal.media.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.thx.traveljournal.common.entity.BaseEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("journal_media")
public class JournalMedia extends BaseEntity {
    private Long journalEntryId;
    private Long mediaAssetId;
    private String caption;
    private Integer sortOrder;
}
