package com.thx.traveljournal.budget.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.thx.traveljournal.common.entity.BaseEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;
import java.time.LocalDate;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("expense")
public class Expense extends BaseEntity {
    private Long tripId;
    private Long budgetCategoryId;
    private Long tripStopId;
    private LocalDate expenseDate;
    private BigDecimal amount;
    private String description;
    private String merchant;
    private String note;
}
