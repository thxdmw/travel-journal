package com.thx.traveljournal.budget.service;

import com.thx.traveljournal.budget.entity.BudgetCategory;
import com.thx.traveljournal.budget.entity.Expense;
import com.thx.traveljournal.budget.mapper.BudgetCategoryMapper;
import com.thx.traveljournal.budget.mapper.ExpenseMapper;
import com.thx.traveljournal.trip.entity.Trip;
import com.thx.traveljournal.trip.mapper.TripMapper;
import com.thx.traveljournal.trip.mapper.TripStopMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class BudgetServiceTest {
    private BudgetCategoryMapper categoryMapper;
    private ExpenseMapper expenseMapper;
    private TripMapper tripMapper;
    private BudgetService service;

    @BeforeEach
    void setUp() {
        categoryMapper = mock(BudgetCategoryMapper.class);
        expenseMapper = mock(ExpenseMapper.class);
        tripMapper = mock(TripMapper.class);
        service = new BudgetService(categoryMapper, expenseMapper, tripMapper, mock(TripStopMapper.class));
    }

    @Test
    void shouldCalculateBudgetAndOverrunPrecisely() {
        Trip trip = new Trip();
        trip.setId(1L);
        trip.setDefaultCurrency("CNY");
        when(tripMapper.selectById(1L)).thenReturn(trip);

        BudgetCategory transport = category(10L, "TRANSPORT", "交通", "1000.00");
        BudgetCategory food = category(11L, "FOOD", "餐饮", "500.00");
        when(categoryMapper.selectList(any())).thenReturn(List.of(transport, food));

        Expense e1 = expense(10L, "1200.50");
        Expense e2 = expense(11L, "200.00");
        when(expenseMapper.selectList(any())).thenReturn(List.of(e1, e2));

        BudgetService.BudgetSummary summary = service.summary(1L);

        assertThat(summary.plannedTotal()).isEqualByComparingTo("1500.00");
        assertThat(summary.actualTotal()).isEqualByComparingTo("1400.50");
        assertThat(summary.remaining()).isEqualByComparingTo("99.50");
        assertThat(summary.categories().getFirst().overBudget()).isTrue();
        assertThat(summary.categories().getFirst().remaining()).isEqualByComparingTo("-200.50");
    }

    private BudgetCategory category(Long id, String code, String name, String amount) {
        BudgetCategory item = new BudgetCategory();
        item.setId(id); item.setTripId(1L); item.setCode(code); item.setName(name);
        item.setPlannedAmount(new BigDecimal(amount)); item.setSortOrder(0);
        return item;
    }
    private Expense expense(Long categoryId, String amount) {
        Expense item = new Expense();
        item.setTripId(1L); item.setBudgetCategoryId(categoryId); item.setAmount(new BigDecimal(amount));
        return item;
    }
}
