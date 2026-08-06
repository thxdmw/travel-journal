package com.thx.traveljournal.journaltemplate.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.thx.traveljournal.common.api.ApiResponse;
import com.thx.traveljournal.journaltemplate.entity.JournalTemplate;
import com.thx.traveljournal.journaltemplate.service.JournalTemplateService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/admin/journal-templates")
@RequiredArgsConstructor
public class AdminJournalTemplateController {
    private final JournalTemplateService service;

    public record TemplateRequest(@NotBlank @Size(max = 120) String name,
                                  @Size(max = 500) String description,
                                  @Size(max = 50) String category,
                                  @NotNull JsonNode definitionJson,
                                  Boolean enabled) {}
    public record GenerateRequest(Long journalId, @NotNull Long tripId, Long tripStopId,
                                  @NotNull LocalDate occurredOn, JsonNode data) {}

    @GetMapping
    public ApiResponse<List<JournalTemplate>> list(
            @RequestParam(defaultValue = "false") boolean enabledOnly) {
        return ApiResponse.ok(service.list(enabledOnly));
    }

    @GetMapping("/{id}")
    public ApiResponse<JournalTemplate> get(@PathVariable Long id) {
        return ApiResponse.ok(service.get(id));
    }

    @PostMapping
    public ApiResponse<JournalTemplate> create(@Valid @RequestBody TemplateRequest request) {
        return ApiResponse.ok(service.create(toInput(request)));
    }

    @PutMapping("/{id}")
    public ApiResponse<JournalTemplate> update(@PathVariable Long id,
                                               @Valid @RequestBody TemplateRequest request) {
        return ApiResponse.ok(service.update(id, toInput(request)));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ApiResponse.ok();
    }

    @PostMapping("/{id}/duplicate")
    public ApiResponse<JournalTemplate> duplicate(@PathVariable Long id) {
        return ApiResponse.ok(service.duplicate(id));
    }

    @PostMapping("/{id}/generate")
    public ApiResponse<JournalTemplateService.GenerateResult> generate(
            @PathVariable Long id, @Valid @RequestBody GenerateRequest request) {
        return ApiResponse.ok(service.generate(id, new JournalTemplateService.GenerateInput(
                request.journalId(), request.tripId(), request.tripStopId(), request.occurredOn(), request.data())));
    }

    private JournalTemplateService.TemplateInput toInput(TemplateRequest request) {
        return new JournalTemplateService.TemplateInput(request.name(), request.description(),
                request.category(), request.definitionJson(), request.enabled());
    }
}
