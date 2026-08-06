package com.thx.traveljournal.budget.mapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.thx.traveljournal.budget.entity.Expense;
/**
 * 实际支出流水，用于和预算对比。
 *
 * <p>对应数据库表 {@code expense}，基础的增删改查由 MyBatis-Plus 的 BaseMapper 提供。</p>
 */
public interface ExpenseMapper extends BaseMapper<Expense> {}
