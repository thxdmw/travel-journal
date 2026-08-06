package com.thx.traveljournal.trip.entity;

import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.thx.traveljournal.common.entity.BaseEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDate;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("trip")
public class Trip extends BaseEntity {
    private String title;
    private String slug;
    private String summary;
    private String status;
    private LocalDate startDate;
    private LocalDate endDate;
    private String defaultCurrency;
    private Long coverMediaId;
    private String internalNote;
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String themeKey;
}
