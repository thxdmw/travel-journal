package com.thx.traveljournal.budget.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.thx.traveljournal.common.entity.BaseEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;

/**
 * 旅行的预算分类，新建旅行时会自动生成一套默认分类。
 *
 * <p>对应数据库表 {@code budget_category}，字段注释与库中的 COMMENT 保持一致。</p>
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName("budget_category")
public class BudgetCategory extends BaseEntity {
    /** 所属旅行，旅行删除时级联删除 */
    private Long tripId;
    /** 分类编码，同一旅行内唯一，例如 TRANSPORT、HOTEL */
    private String code;
    /** 分类名称 */
    private String name;
    /** 计划金额，不能为负数 */
    private BigDecimal plannedAmount;
    /** 排序号，从 0 开始 */
    private Integer sortOrder;
}
