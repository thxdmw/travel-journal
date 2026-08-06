package com.thx.traveljournal.itinerary.entity;

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
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName("itinerary_item")
public class ItineraryItem extends BaseEntity {
    /** 所属旅行，旅行删除时级联删除 */
    private Long tripId;
    /** 关联的城市，城市删除时置空而不删除本行程 */
    private Long tripStopId;
    /** 行程日期，默认必须落在旅行的起止日期内 */
    private LocalDate itemDate;
    /** 开始时间 */
    private LocalTime startTime;
    /** 结束时间，不得早于开始时间 */
    private LocalTime endTime;
    /** 行程类型：TRANSPORT 交通、HOTEL 住宿、FOOD 餐饮、ATTRACTION 景点、SHOPPING 购物、ACTIVITY 活动、OTHER 其他 */
    private String type;
    /** 行程标题 */
    private String title;
    /** 地址 */
    private String address;
    /** 备注 */
    private String note;
    /** 预计花费，不能为负数 */
    private BigDecimal plannedCost;
    /** 是否已完成 */
    private Boolean completed;
    /** 同一旅行内的排序号，从 0 开始 */
    private Integer sortOrder;
}
