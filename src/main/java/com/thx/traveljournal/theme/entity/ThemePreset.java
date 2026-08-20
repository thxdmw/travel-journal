package com.thx.traveljournal.theme.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.FieldStrategy;
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
    /** 基础视觉，目前仅 base，负责封面版式和 CSS 兜底 */
    private String baseThemeKey;
    /** 主题预览图地址 */
    private String previewImageUrl;
    /**
     * 主题配置，JSON 对象。除了 colors、typography、shape、layout、card、background、image、
     * gallery、motion、effects、map、hero 这些视觉参数，还包含 Theme Pack V2 的
     * decorations、stickers、dividers、ambient、blockStyles、interactions——
     * 后者决定的是页面的性格而不只是长相。可调项全表见 ThemePresetService.SCHEMA。
     */
    @TableField(typeHandler = JsonNodeTypeHandler.class)
    private JsonNode definitionJson;
    /**
     * 系统预设的用户覆盖：稀疏 JSON，只含相对 {@link #definitionJson} 改动过的字段。
     * 只对 {@code builtin=true} 的行有意义，个人主题恒为 null。
     * 生效值 = deepMerge(definitionJson, overrideJson)，见 ThemePresetService。
     */
    @TableField(typeHandler = JsonNodeTypeHandler.class, updateStrategy = FieldStrategy.ALWAYS)
    private JsonNode overrideJson;
    /** 是否为系统预设；系统预设的官方 definitionJson 不可直接改写，修改会存进 overrideJson */
    private Boolean builtin;
    /** 是否启用，停用后不能被选用 */
    private Boolean enabled;
    /** 版本号，每次修改自增 */
    private Integer version;
}
