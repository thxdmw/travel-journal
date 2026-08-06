package com.thx.traveljournal.theme.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.thx.traveljournal.common.api.ApiResponse;
import com.thx.traveljournal.theme.service.ThemePresetService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/admin/themes")
@RequiredArgsConstructor
public class AdminThemePresetController {
    private final ThemePresetService service;

    public record ThemeRequest(@NotBlank @Size(max = 100) String name,
                               @Size(max = 500) String description,
                               @Size(max = 64) String baseThemeKey,
                               @Size(max = 500) String previewImageUrl,
                               @NotNull JsonNode definitionJson,
                               Boolean enabled) {}

    @GetMapping
    public ApiResponse<List<ThemePresetService.ThemeView>> list(
            @RequestParam(defaultValue = "false") boolean enabledOnly) {
        return ApiResponse.ok(service.list(enabledOnly));
    }

    @PostMapping
    public ApiResponse<ThemePresetService.ThemeView> create(@Valid @RequestBody ThemeRequest request) {
        return ApiResponse.ok(service.create(request.name(), request.description(), request.baseThemeKey(),
                request.previewImageUrl(), request.definitionJson(), request.enabled()));
    }

    @PutMapping("/{id}")
    public ApiResponse<ThemePresetService.ThemeView> update(@PathVariable Long id,
                                                             @Valid @RequestBody ThemeRequest request) {
        return ApiResponse.ok(service.update(id, request.name(), request.description(), request.baseThemeKey(),
                request.previewImageUrl(), request.definitionJson(), request.enabled()));
    }

    @PostMapping("/{id}/duplicate")
    public ApiResponse<ThemePresetService.ThemeView> duplicate(@PathVariable Long id) {
        return ApiResponse.ok(service.duplicate(id));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ApiResponse.ok();
    }
}
