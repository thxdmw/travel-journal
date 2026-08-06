package com.thx.traveljournal.map.controller;

import com.thx.traveljournal.common.api.ApiResponse;
import com.thx.traveljournal.map.service.MapLocationService;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/** 后台地图接口：配置状态、地点搜索和逆地理编码，供城市弹窗里的选点使用。 */
@Validated
@RestController
@RequestMapping("/api/admin/map")
@RequiredArgsConstructor
public class AdminMapController {
    private final MapLocationService service;

    @GetMapping("/status")
    public ApiResponse<Map<String, Object>> status() {
        return ApiResponse.ok(service.status());
    }

    @GetMapping("/search")
    public ApiResponse<List<MapLocationService.LocationView>> search(
            @RequestParam @Size(min = 1, max = 120) String keyword,
            @RequestParam(required = false) @Size(max = 120) String region) {
        return ApiResponse.ok(service.search(keyword, region));
    }

    @GetMapping("/reverse")
    public ApiResponse<MapLocationService.LocationView> reverse(
            @RequestParam @NotNull @DecimalMin("-90") @DecimalMax("90") BigDecimal latitude,
            @RequestParam @NotNull @DecimalMin("-180") @DecimalMax("180") BigDecimal longitude) {
        return ApiResponse.ok(service.reverse(latitude, longitude));
    }
}
