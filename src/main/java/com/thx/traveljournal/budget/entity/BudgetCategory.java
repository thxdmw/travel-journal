package com.thx.traveljournal.budget.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.thx.traveljournal.common.entity.BaseEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("budget_category")
public class BudgetCategory extends BaseEntity {
    private Long tripId;
    private String code;
    private String name;
    private BigDecimal plannedAmount;
    private Integer sortOrder;
}
