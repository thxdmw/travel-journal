package com.thx.traveljournal.dashboard.controller;

import com.thx.traveljournal.common.api.ApiResponse;
import com.thx.traveljournal.dashboard.service.DashboardService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 后台首页概览，需要管理员登录。 */
@RestController
@RequestMapping("/api/admin/dashboard")
@RequiredArgsConstructor
public class AdminDashboardController {
    private final DashboardService service;

    @GetMapping
    public ApiResponse<DashboardService.DashboardView> overview() {
        return ApiResponse.ok(service.overview());
    }
}
