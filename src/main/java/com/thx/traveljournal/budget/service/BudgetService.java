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
import java.util.Objects;

/**
 * 预算与支出服务。
 *
 * <p>预算按分类记计划金额，支出是实际流水；两者相减得到每个分类的结余，
 * 汇总结果由 {@link #summary} 现算，不落库，省得维护一份会算错的冗余数据。</p>
 */
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

    /** 汇总某次旅行的预算执行情况：各分类的计划、实际、结余，以及总计。 */
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

    /**
     * 新增预算分类，一律排在末尾。
     *
     * <p>序号由后端分配，取现有最大值 + 1，不接受前端传来的值。用条数会出问题：
     * 删掉中间一条之后 [0,1,2] 变成 [0,2]，条数是 2，最大序号也是 2，新增的那条
     * 会和现有的撞在一起。</p>
     */
    public BudgetCategory createCategory(Long tripId, BudgetCategory category) {
        requireTrip(tripId);
        category.setTripId(tripId);
        if (category.getPlannedAmount() == null) category.setPlannedAmount(BigDecimal.ZERO);
        category.setSortOrder(categories(tripId).stream()
                .map(BudgetCategory::getSortOrder)
                .filter(Objects::nonNull)
                .max(Integer::compareTo).map(max -> max + 1).orElse(0));
        validateCategory(category);
        categoryMapper.insert(category);
        return category;
    }

    public BudgetCategory updateCategory(Long id, BudgetCategory input) {
        BudgetCategory category = requireCategory(id);
        category.setCode(input.getCode());
        category.setName(input.getName());
        category.setPlannedAmount(input.getPlannedAmount());
        // 顺序不归编辑表单管；表单没带就保留库里那个
        if (input.getSortOrder() != null) category.setSortOrder(input.getSortOrder());
        validateCategory(category);
        categoryMapper.updateById(category);
        return category;
    }

    /** 删除预算分类。已经记过支出的分类不允许删，否则那些流水会失去归属。 */
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

    /** 校验支出：金额必须为正，预算分类和城市都必须属于同一次旅行。 */
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
