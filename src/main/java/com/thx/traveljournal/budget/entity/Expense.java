package com.thx.traveljournal.budget.entity;

import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.thx.traveljournal.common.entity.BaseEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 实际支出流水，用于和预算对比。
 *
 * <p>对应数据库表 {@code expense}，字段注释与库中的 COMMENT 保持一致。</p>
 *
 * <p>可空字段标了 {@link FieldStrategy#ALWAYS}：记账是整表单提交，「取消这笔支出与某座
 * 城市的关联」必须真的把 trip_stop_id 置空，而不是被默认策略当成「这个字段没改」跳过。</p>
 *
 * <p>{@code description} 是 NOT NULL，不标。</p>
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName("expense")
public class Expense extends BaseEntity {
    /** 所属旅行，旅行删除时级联删除 */
    private Long tripId;
    /** 归属的预算分类，必须属于同一次旅行；仍有支出的分类不允许删除 */
    private Long budgetCategoryId;
    /** 发生地城市，城市删除时置空 */
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private Long tripStopId;
    /** 支出日期 */
    private LocalDate expenseDate;
    /** 支出金额，必须大于 0 */
    private BigDecimal amount;
    /** 支出说明 */
    private String description;
    /** 商户名称 */
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String merchant;
    /** 备注 */
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String note;
}
