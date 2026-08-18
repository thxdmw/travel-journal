package com.thx.traveljournal.itinerary.entity;

import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.thx.traveljournal.common.entity.BaseEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;

/**
 * 按天安排的行程条目，例如交通、住宿、景点。
 *
 * <p>对应数据库表 {@code itinerary_item}，字段注释与库中的 COMMENT 保持一致。</p>
 *
 * <p>可空字段标了 {@link FieldStrategy#ALWAYS}：编辑行程是整表单提交，「原来关联了成都，
 * 现在改成不关联任何城市」「删掉预计花费」这类操作必须真的落库。默认策略会跳过 null 字段，
 * 那样这些改动在 UPDATE 里根本不出现，刷新一下旧值又回来了。</p>
 *
 * <p>{@code tripId}、{@code itemDate}、{@code type}、{@code title} 等是 NOT NULL，不标。</p>
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName("itinerary_item")
public class ItineraryItem extends BaseEntity {
    /** 所属旅行，旅行删除时级联删除 */
    private Long tripId;
    /** 关联的城市，城市删除时置空而不删除本行程 */
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private Long tripStopId;
    /** 行程日期，默认必须落在旅行的起止日期内 */
    private LocalDate itemDate;
    /** 开始时间 */
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private LocalTime startTime;
    /** 结束时间，不得早于开始时间 */
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private LocalTime endTime;
    /** 行程类型：TRANSPORT 交通、HOTEL 住宿、FOOD 餐饮、ATTRACTION 景点、SHOPPING 购物、ACTIVITY 活动、OTHER 其他 */
    private String type;
    /** 行程标题 */
    private String title;
    /** 地址 */
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String address;
    /** 备注 */
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String note;
    /** 预计花费，不能为负数 */
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private BigDecimal plannedCost;
    /** 是否已完成 */
    private Boolean completed;
    /** 同一旅行内的排序号，从 0 开始 */
    private Integer sortOrder;
}
