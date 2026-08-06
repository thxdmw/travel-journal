package com.thx.traveljournal.theme.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.databind.JsonNode;
import com.thx.traveljournal.common.entity.BaseEntity;
import com.thx.traveljournal.common.mybatis.JsonNodeTypeHandler;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName(value = "theme_preset", autoResultMap = true)
public class ThemePreset extends BaseEntity {
    private String themeKey;
    private String name;
    private String description;
    private String baseThemeKey;
    private String previewImageUrl;
    @TableField(typeHandler = JsonNodeTypeHandler.class)
    private JsonNode definitionJson;
    private Boolean builtin;
    private Boolean enabled;
    private Integer version;
}
