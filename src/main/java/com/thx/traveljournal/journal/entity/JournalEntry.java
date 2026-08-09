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

/**
 * 旅行日记，前台展示的正文内容。
 *
 * <p>对应数据库表 {@code journal_entry}，字段注释与库中的 COMMENT 保持一致。</p>
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName(value = "journal_entry", autoResultMap = true)
public class JournalEntry extends BaseEntity {
    /** 所属旅行，旅行删除时级联删除 */
    private Long tripId;
    /** 关联城市，必须属于同一次旅行；城市删除时置空 */
    private Long tripStopId;
    /** 日记标题 */
    private String title;
    /** 前台访问用的唯一短链，只允许小写字母、数字和短横线 */
    private String slug;
    /** 摘要，展示在列表卡片上 */
    private String excerpt;
    /** 结构化日记正文，格式为 schemaVersion + blocks；这是正文的唯一数据源 */
    @TableField(typeHandler = JsonNodeTypeHandler.class)
    private JsonNode contentJson;
    /** 状态：DRAFT 草稿、PUBLISHED 已发布；只有已发布的日记及其图片对访客可见 */
    private String status;
    /** 日记记录的事情发生的日期，不是写作日期 */
    private LocalDate occurredOn;
    /** 封面图片，指向 media_asset；图片被删除时自动置空 */
    private Long coverMediaId;
    /** 发布时间，撤回后置空 */
    private OffsetDateTime publishedAt;
    /** 日记专属主题标识，为空表示继承旅行或全站主题 */
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String themeKey;
    /** 生成正文时使用的日记模板，模板被删除时置空 */
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private Long templateId;
    /** 生成时的模板版本号，用于识别模板后续是否有改动 */
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private Integer templateVersion;

    /**
     * 标签名列表。存在关联表里，不是本表字段，所以标注 exist=false 让 MyBatis-Plus 跳过。
     * 查询单篇日记时由 Service 回填，列表查询不填（避免 N+1）。
     */
    @com.baomidou.mybatisplus.annotation.TableField(exist = false)
    private java.util.List<String> tags;
}
