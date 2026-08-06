package com.thx.traveljournal.journal.controller;

import com.fasterxml.jackson.databind.JsonNode;

import com.thx.traveljournal.common.api.ApiResponse;
import com.thx.traveljournal.common.api.PageResponse;
import com.thx.traveljournal.journal.entity.JournalEntry;
import com.thx.traveljournal.journal.service.JournalService;
import com.thx.traveljournal.theme.service.ThemePresetService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;

@RestController
@RequestMapping("/api/admin/journals")
@RequiredArgsConstructor
public class AdminJournalController {
    private final JournalService service;
    private final ThemePresetService themePresetService;

    public record JournalRequest(@NotNull Long tripId, Long tripStopId,
                                 @NotBlank @Size(max=200) String title,
                                 @NotBlank @Size(max=220) String slug,
                                 @Size(max=500) String excerpt,
                                 @NotNull String contentMarkdown,
                                 @NotNull LocalDate occurredOn,
                                 Long coverMediaId,
                                 @Size(max=80) String themeKey,
                                 Long templateId,
                                 Integer templateVersion,
                                 JsonNode templateData,
                                 JsonNode templateSnapshot,
                                 Boolean templateDetached) {}

    @GetMapping
    public ApiResponse<PageResponse<JournalEntry>> list(@RequestParam(defaultValue="1") long page,
                                                        @RequestParam(defaultValue="20") long pageSize,
                                                        @RequestParam(required=false) Long tripId,
                                                        @RequestParam(required=false) String status,
                                                        @RequestParam(required=false) String keyword) {
        return ApiResponse.ok(service.list(page, Math.min(pageSize, 100), tripId, status, keyword));
    }
    @PostMapping
    public ApiResponse<JournalEntry> create(@Valid @RequestBody JournalRequest request) {
        return ApiResponse.ok(service.create(toEntity(request)));
    }
    @GetMapping("/{id}")
    public ApiResponse<JournalEntry> get(@PathVariable Long id) { return ApiResponse.ok(service.get(id)); }
    @PutMapping("/{id}")
    public ApiResponse<JournalEntry> update(@PathVariable Long id, @Valid @RequestBody JournalRequest request) {
        return ApiResponse.ok(service.update(id, toEntity(request)));
    }
    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) { service.delete(id); return ApiResponse.ok(); }
    @PostMapping("/{id}/publish")
    public ApiResponse<JournalEntry> publish(@PathVariable Long id) { return ApiResponse.ok(service.publish(id)); }
    @PostMapping("/{id}/unpublish")
    public ApiResponse<JournalEntry> unpublish(@PathVariable Long id) { return ApiResponse.ok(service.unpublish(id)); }

    private JournalEntry toEntity(JournalRequest request) {
        JournalEntry entity = new JournalEntry();
        BeanUtils.copyProperties(request, entity);
        entity.setThemeKey(themePresetService.validateSelection(request.themeKey()));
        return entity;
    }
}
