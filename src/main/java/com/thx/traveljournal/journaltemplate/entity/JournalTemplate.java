package com.thx.traveljournal.journaltemplate.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.databind.JsonNode;
import com.thx.traveljournal.common.entity.BaseEntity;
import com.thx.traveljournal.common.mybatis.JsonNodeTypeHandler;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 日记模板，把常写的结构固定下来，写作时只填当时的天气、心情和故事。
 *
 * <p>对应数据库表 {@code journal_template}，字段注释与库中的 COMMENT 保持一致。</p>
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName(value = "journal_template", autoResultMap = true)
public class JournalTemplate extends BaseEntity {
    /** 模板名称 */
    private String name;
    /** 模板说明 */
    private String description;
    /** 模板分类，例如 CITY_DAY 城市一日游、FOOD 美食探店、CUSTOM 自定义 */
    private String category;
    /** 模板区块定义，JSON 对象；区块类型限定在固定白名单内，不允许脚本或不受控 HTML */
    @TableField(typeHandler = JsonNodeTypeHandler.class)
    private JsonNode definitionJson;
    /** 版本号，每次修改自增，必须大于 0 */
    private Integer version;
    /** 是否启用，停用后写作时不再出现在可选列表里 */
    private Boolean enabled;
    /** 是否为系统内置模板；内置模板不可直接修改或删除，需先复制为个人模板 */
    private Boolean builtin;
}
