package com.thx.traveljournal.itinerary.controller;

import com.thx.traveljournal.common.api.ApiResponse;
import com.thx.traveljournal.itinerary.entity.ItineraryItem;
import com.thx.traveljournal.itinerary.service.ItineraryService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminItineraryController {
    private final ItineraryService service;

    public record ItemRequest(Long tripStopId, @NotNull LocalDate itemDate,
                              LocalTime startTime, LocalTime endTime,
                              @NotBlank String type, @NotBlank @Size(max=200) String title,
                              @Size(max=500) String address, String note,
                              @PositiveOrZero BigDecimal plannedCost,
                              Boolean completed, Integer sortOrder,
                              Boolean allowOutsideTripDates) {}
    public record CompletedRequest(boolean completed) {}
    public record ReorderRequest(@NotEmpty List<Long> orderedIds) {}

    @GetMapping("/trips/{tripId}/itinerary")
    public ApiResponse<List<ItineraryItem>> list(@PathVariable Long tripId) {
        return ApiResponse.ok(service.list(tripId));
    }
    @PostMapping("/trips/{tripId}/itinerary")
    public ApiResponse<ItineraryItem> create(@PathVariable Long tripId, @Valid @RequestBody ItemRequest request) {
        return ApiResponse.ok(service.create(tripId, toEntity(request), Boolean.TRUE.equals(request.allowOutsideTripDates())));
    }
    @PutMapping("/itinerary/{id}")
    public ApiResponse<ItineraryItem> update(@PathVariable Long id, @Valid @RequestBody ItemRequest request) {
        return ApiResponse.ok(service.update(id, toEntity(request), Boolean.TRUE.equals(request.allowOutsideTripDates())));
    }
    @DeleteMapping("/itinerary/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) { service.delete(id); return ApiResponse.ok(); }
    @PatchMapping("/itinerary/{id}/completed")
    public ApiResponse<ItineraryItem> completed(@PathVariable Long id, @RequestBody CompletedRequest request) {
        return ApiResponse.ok(service.setCompleted(id, request.completed()));
    }
    @PutMapping("/trips/{tripId}/itinerary/reorder")
    public ApiResponse<Void> reorder(@PathVariable Long tripId, @Valid @RequestBody ReorderRequest request) {
        service.reorder(tripId, request.orderedIds()); return ApiResponse.ok();
    }

    private ItineraryItem toEntity(ItemRequest request) {
        ItineraryItem entity = new ItineraryItem();
        BeanUtils.copyProperties(request, entity);
        return entity;
    }
}
