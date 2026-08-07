package com.thx.traveljournal.journal.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.thx.traveljournal.common.entity.BaseEntity;
import lombok.Getter;
import lombok.Setter;

/** 日记与标签的关联行。 */
@Getter
@Setter
@TableName("journal_tag_relation")
public class JournalTagRelation extends BaseEntity {
    private Long journalEntryId;
    private Long journalTagId;
}
