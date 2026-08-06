package com.thx.traveljournal.journal.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.fasterxml.jackson.databind.JsonNode;
import com.thx.traveljournal.common.entity.BaseEntity;
import com.thx.traveljournal.common.mybatis.JsonNodeTypeHandler;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDate;
import java.time.OffsetDateTime;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName(value = "journal_entry", autoResultMap = true)
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
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String themeKey;
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private Long templateId;
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private Integer templateVersion;
    @TableField(typeHandler = JsonNodeTypeHandler.class, updateStrategy = FieldStrategy.ALWAYS)
    private JsonNode templateData;
    @TableField(typeHandler = JsonNodeTypeHandler.class, updateStrategy = FieldStrategy.ALWAYS)
    private JsonNode templateSnapshot;
    private Boolean templateDetached;
}
