package com.thx.traveljournal.theme.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.databind.JsonNode;
import com.thx.traveljournal.common.entity.BaseEntity;
import com.thx.traveljournal.common.mybatis.JsonNodeTypeHandler;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 主题预设，控制前台的色彩、字体、圆角、布局和图片风格。
 *
 * <p>对应数据库表 {@code theme_preset}，字段注释与库中的 COMMENT 保持一致。</p>
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName(value = "theme_preset", autoResultMap = true)
public class ThemePreset extends BaseEntity {
    /** 主题标识，全局唯一，被 admin_user、trip 和 journal_entry 引用 */
    private String themeKey;
    /** 主题名称 */
    private String name;
    /** 主题说明 */
    private String description;
    /** 基础视觉，目前仅 travel-classic，负责封面版式和 CSS 兜底 */
    private String baseThemeKey;
    /** 主题预览图地址 */
    private String previewImageUrl;
    /** 主题配置，JSON 对象，含 colors、typography、shape、layout、image、motion 六组设置 */
    @TableField(typeHandler = JsonNodeTypeHandler.class)
    private JsonNode definitionJson;
    /** 是否为系统预设；系统预设不可直接修改或删除，需先复制 */
    private Boolean builtin;
    /** 是否启用，停用后不能被选用 */
    private Boolean enabled;
    /** 版本号，每次修改自增 */
    private Integer version;
}
