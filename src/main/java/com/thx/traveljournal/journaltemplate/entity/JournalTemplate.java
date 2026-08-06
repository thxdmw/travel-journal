package com.thx.traveljournal.journaltemplate.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.databind.JsonNode;
import com.thx.traveljournal.common.entity.BaseEntity;
import com.thx.traveljournal.common.mybatis.JsonNodeTypeHandler;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName(value = "journal_template", autoResultMap = true)
public class JournalTemplate extends BaseEntity {
    private String name;
    private String description;
    private String category;
    @TableField(typeHandler = JsonNodeTypeHandler.class)
    private JsonNode definitionJson;
    private Integer version;
    private Boolean enabled;
    private Boolean builtin;
}
