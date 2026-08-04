package com.thx.traveljournal.itinerary.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.thx.traveljournal.common.entity.BaseEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("itinerary_item")
public class ItineraryItem extends BaseEntity {
    private Long tripId;
    private Long tripStopId;
    private LocalDate itemDate;
    private LocalTime startTime;
    private LocalTime endTime;
    private String type;
    private String title;
    private String address;
    private String note;
    private BigDecimal plannedCost;
    private Boolean completed;
    private Integer sortOrder;
}
