package com.thx.traveljournal.trip.entity;

import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.thx.traveljournal.common.entity.BaseEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDate;

/**
 * 一次旅行，是城市、行程、预算、支出和日记的归属主体。
 *
 * <p>对应数据库表 {@code trip}，字段注释与库中的 COMMENT 保持一致。</p>
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName("trip")
public class Trip extends BaseEntity {
    /** 旅行标题 */
    private String title;
    /** 前台访问用的唯一短链，只允许小写字母、数字和短横线 */
    private String slug;
    /** 旅行简介，展示在前台卡片和详情页 */
    private String summary;
    /** 旅行状态：PLANNING 规划中、ONGOING 旅行中、COMPLETED 已完成、ARCHIVED 已归档 */
    private String status;
    /** 开始日期 */
    private LocalDate startDate;
    /** 结束日期，不得早于开始日期 */
    private LocalDate endDate;
    /** 默认币种，三位大写字母代码，例如 CNY */
    private String defaultCurrency;
    /** 封面图片，指向 media_asset；图片被删除时自动置空 */
    private Long coverMediaId;
    /** 仅后台可见的内部备注，不会出现在前台 */
    private String internalNote;
    /** 旅行专属主题标识，为空表示继承全站主题 */
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String themeKey;
}
