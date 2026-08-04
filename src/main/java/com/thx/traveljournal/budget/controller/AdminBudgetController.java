package com.thx.traveljournal.budget.controller;

import com.thx.traveljournal.budget.entity.BudgetCategory;
import com.thx.traveljournal.budget.entity.Expense;
import com.thx.traveljournal.budget.service.BudgetService;
import com.thx.traveljournal.common.api.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminBudgetController {
    private final BudgetService service;

    public record CategoryRequest(@NotBlank @Size(max=32) String code,
                                  @NotBlank @Size(max=80) String name,
                                  @NotNull @PositiveOrZero BigDecimal plannedAmount,
                                  Integer sortOrder) {}
    public record ExpenseRequest(@NotNull Long budgetCategoryId, Long tripStopId,
                                 @NotNull LocalDate expenseDate,
                                 @NotNull @Positive BigDecimal amount,
                                 @NotBlank @Size(max=500) String description,
                                 @Size(max=160) String merchant, String note) {}

    @GetMapping("/trips/{tripId}/budget")
    public ApiResponse<BudgetService.BudgetSummary> summary(@PathVariable Long tripId) {
        return ApiResponse.ok(service.summary(tripId));
    }
    @PostMapping("/trips/{tripId}/budget-categories")
    public ApiResponse<BudgetCategory> createCategory(@PathVariable Long tripId, @Valid @RequestBody CategoryRequest request) {
        return ApiResponse.ok(service.createCategory(tripId, toCategory(request)));
    }
    @PutMapping("/budget-categories/{id}")
    public ApiResponse<BudgetCategory> updateCategory(@PathVariable Long id, @Valid @RequestBody CategoryRequest request) {
        return ApiResponse.ok(service.updateCategory(id, toCategory(request)));
    }
    @DeleteMapping("/budget-categories/{id}")
    public ApiResponse<Void> deleteCategory(@PathVariable Long id) { service.deleteCategory(id); return ApiResponse.ok(); }

    @GetMapping("/trips/{tripId}/expenses")
    public ApiResponse<List<Expense>> expenses(@PathVariable Long tripId) { return ApiResponse.ok(service.expenses(tripId)); }
    @PostMapping("/trips/{tripId}/expenses")
    public ApiResponse<Expense> createExpense(@PathVariable Long tripId, @Valid @RequestBody ExpenseRequest request) {
        return ApiResponse.ok(service.createExpense(tripId, toExpense(request)));
    }
    @PutMapping("/expenses/{id}")
    public ApiResponse<Expense> updateExpense(@PathVariable Long id, @Valid @RequestBody ExpenseRequest request) {
        return ApiResponse.ok(service.updateExpense(id, toExpense(request)));
    }
    @DeleteMapping("/expenses/{id}")
    public ApiResponse<Void> deleteExpense(@PathVariable Long id) { service.deleteExpense(id); return ApiResponse.ok(); }

    private BudgetCategory toCategory(CategoryRequest request) {
        BudgetCategory entity = new BudgetCategory(); BeanUtils.copyProperties(request, entity); return entity;
    }
    private Expense toExpense(ExpenseRequest request) {
        Expense entity = new Expense(); BeanUtils.copyProperties(request, entity); return entity;
    }
}
