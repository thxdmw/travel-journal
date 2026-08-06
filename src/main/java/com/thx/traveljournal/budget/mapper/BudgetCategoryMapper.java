package com.thx.traveljournal.budget.mapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.thx.traveljournal.budget.entity.BudgetCategory;
/**
 * 旅行的预算分类，新建旅行时会自动生成一套默认分类。
 *
 * <p>对应数据库表 {@code budget_category}，基础的增删改查由 MyBatis-Plus 的 BaseMapper 提供。</p>
 */
public interface BudgetCategoryMapper extends BaseMapper<BudgetCategory> {}
