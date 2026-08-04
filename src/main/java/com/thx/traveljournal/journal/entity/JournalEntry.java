package com.thx.traveljournal.journal.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.thx.traveljournal.common.entity.BaseEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDate;
import java.time.OffsetDateTime;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("journal_entry")
public class JournalEntry extends BaseEntity {
    private Long tripId;
    private Long tripStopId;
    private String title;
    private String slug;
    private String excerpt;
    private String contentMarkdown;
    private String status;
    private LocalDate occurredOn;
    private Long coverMediaId;
    private OffsetDateTime publishedAt;
}
