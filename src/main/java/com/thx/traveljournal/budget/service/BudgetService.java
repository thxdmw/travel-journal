package com.thx.traveljournal.budget.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.thx.traveljournal.budget.entity.BudgetCategory;
import com.thx.traveljournal.budget.entity.Expense;
import com.thx.traveljournal.budget.mapper.BudgetCategoryMapper;
import com.thx.traveljournal.budget.mapper.ExpenseMapper;
import com.thx.traveljournal.common.exception.BusinessException;
import com.thx.traveljournal.trip.entity.Trip;
import com.thx.traveljournal.trip.entity.TripStop;
import com.thx.traveljournal.trip.mapper.TripMapper;
import com.thx.traveljournal.trip.mapper.TripStopMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
public class BudgetService {
    private final BudgetCategoryMapper categoryMapper;
    private final ExpenseMapper expenseMapper;
    private final TripMapper tripMapper;
    private final TripStopMapper stopMapper;

    public record CategorySummary(Long id, String code, String name, BigDecimal planned,
                                  BigDecimal actual, BigDecimal remaining, boolean overBudget) {}
    public record BudgetSummary(String currency, BigDecimal plannedTotal, BigDecimal actualTotal,
                                BigDecimal remaining, List<CategorySummary> categories) {}

    public List<BudgetCategory> categories(Long tripId) {
        requireTrip(tripId);
        return categoryMapper.selectList(new LambdaQueryWrapper<BudgetCategory>()
                .eq(BudgetCategory::getTripId, tripId).orderByAsc(BudgetCategory::getSortOrder));
    }

    public BudgetSummary summary(Long tripId) {
        Trip trip = requireTrip(tripId);
        List<BudgetCategory> categories = categories(tripId);
        List<Expense> expenses = expenses(tripId);
        BigDecimal plannedTotal = BigDecimal.ZERO;
        BigDecimal actualTotal = BigDecimal.ZERO;
        List<CategorySummary> items = new ArrayList<>();
        for (BudgetCategory category : categories) {
            BigDecimal planned = zero(category.getPlannedAmount());
            BigDecimal actual = expenses.stream()
                    .filter(e -> category.getId().equals(e.getBudgetCategoryId()))
                    .map(Expense::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
            plannedTotal = plannedTotal.add(planned);
            actualTotal = actualTotal.add(actual);
            items.add(new CategorySummary(category.getId(), category.getCode(), category.getName(),
                    planned, actual, planned.subtract(actual), actual.compareTo(planned) > 0));
        }
        return new BudgetSummary(trip.getDefaultCurrency(), plannedTotal, actualTotal,
                plannedTotal.subtract(actualTotal), items);
    }

    public BudgetCategory createCategory(Long tripId, BudgetCategory category) {
        requireTrip(tripId);
        category.setTripId(tripId);
        if (category.getPlannedAmount() == null) category.setPlannedAmount(BigDecimal.ZERO);
        if (category.getSortOrder() == null) category.setSortOrder(categories(tripId).size());
        validateCategory(category);
        categoryMapper.insert(category);
        return category;
    }

    public BudgetCategory updateCategory(Long id, BudgetCategory input) {
        BudgetCategory category = requireCategory(id);
        category.setCode(input.getCode());
        category.setName(input.getName());
        category.setPlannedAmount(input.getPlannedAmount());
        category.setSortOrder(input.getSortOrder());
        validateCategory(category);
        categoryMapper.updateById(category);
        return category;
    }

    public void deleteCategory(Long id) {
        requireCategory(id);
        long references = expenseMapper.selectCount(new LambdaQueryWrapper<Expense>().eq(Expense::getBudgetCategoryId, id));
        if (references > 0) throw BusinessException.conflict("该分类已有支出记录，不能删除");
        categoryMapper.deleteById(id);
    }

    public List<Expense> expenses(Long tripId) {
        requireTrip(tripId);
        return expenseMapper.selectList(new LambdaQueryWrapper<Expense>()
                .eq(Expense::getTripId, tripId).orderByDesc(Expense::getExpenseDate, Expense::getId));
    }

    public Expense createExpense(Long tripId, Expense expense) {
        expense.setTripId(tripId);
        validateExpense(expense);
        expenseMapper.insert(expense);
        return expense;
    }

    public Expense updateExpense(Long id, Expense input) {
        Expense expense = requireExpense(id);
        input.setId(id);
        input.setTripId(expense.getTripId());
        validateExpense(input);
        expenseMapper.updateById(input);
        return requireExpense(id);
    }

    public void deleteExpense(Long id) {
        requireExpense(id);
        expenseMapper.deleteById(id);
    }

    private void validateCategory(BudgetCategory category) {
        if (category.getPlannedAmount() == null || category.getPlannedAmount().signum() < 0)
            throw BusinessException.badRequest("预算金额不能为负数");
        category.setCode(category.getCode().trim().toUpperCase());
    }

    private void validateExpense(Expense expense) {
        requireTrip(expense.getTripId());
        if (expense.getAmount() == null || expense.getAmount().signum() <= 0)
            throw BusinessException.badRequest("支出金额必须大于 0");
        BudgetCategory category = requireCategory(expense.getBudgetCategoryId());
        if (!expense.getTripId().equals(category.getTripId())) throw BusinessException.badRequest("预算分类不属于当前旅行");
        if (expense.getTripStopId() != null) {
            TripStop stop = stopMapper.selectById(expense.getTripStopId());
            if (stop == null || !expense.getTripId().equals(stop.getTripId())) throw BusinessException.badRequest("城市不属于当前旅行");
        }
    }

    private Trip requireTrip(Long id) {
        Trip trip = tripMapper.selectById(id);
        if (trip == null) throw BusinessException.notFound("旅行不存在");
        return trip;
    }
    private BudgetCategory requireCategory(Long id) {
        BudgetCategory category = categoryMapper.selectById(id);
        if (category == null) throw BusinessException.notFound("预算分类不存在");
        return category;
    }
    private Expense requireExpense(Long id) {
        Expense expense = expenseMapper.selectById(id);
        if (expense == null) throw BusinessException.notFound("支出不存在");
        return expense;
    }
    private BigDecimal zero(BigDecimal value) { return value == null ? BigDecimal.ZERO : value; }
}
