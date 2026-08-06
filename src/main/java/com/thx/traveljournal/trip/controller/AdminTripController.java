package com.thx.traveljournal.trip.controller;

import com.thx.traveljournal.common.api.ApiResponse;
import com.thx.traveljournal.common.api.PageResponse;
import com.thx.traveljournal.trip.entity.Trip;
import com.thx.traveljournal.trip.entity.TripStop;
import com.thx.traveljournal.trip.service.TripService;
import com.thx.traveljournal.theme.service.ThemePresetService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminTripController {
    private final TripService service;
    private final ThemePresetService themePresetService;

    public record TripRequest(@NotBlank @Size(max=160) String title,
                              @NotBlank @Size(max=180) String slug,
                              @Size(max=1000) String summary,
                              @NotBlank String status,
                              @NotNull LocalDate startDate,
                              @NotNull LocalDate endDate,
                              @NotBlank @Pattern(regexp="[A-Za-z]{3}") String defaultCurrency,
                              Long coverMediaId, String internalNote,
                              @Size(max=80) String themeKey) {}
    public record StatusRequest(@NotBlank String status) {}
    public record StopRequest(@NotBlank @Size(max=120) String cityName,
                              @Size(max=120) String regionName,
                              @NotBlank @Size(max=120) String countryName,
                              @Pattern(regexp="^$|[A-Za-z]{2}") String countryCode,
                              @NotNull BigDecimal latitude, @NotNull BigDecimal longitude,
                              @Size(max=128) String placeId,
                              @Size(max=500) String formattedAddress,
                              @Size(max=32) String adcode,
                              @Size(max=20) String coordinateSystem,
                              @Size(max=30) String locationSource,
                              LocalDate arrivalDate, LocalDate departureDate,
                              Integer sortOrder, @Size(max=1000) String note) {}
    public record ReorderRequest(@NotEmpty List<Long> orderedIds) {}

    @GetMapping("/trips")
    public ApiResponse<PageResponse<Trip>> list(@RequestParam(defaultValue="1") long page,
                                                @RequestParam(defaultValue="20") long pageSize,
                                                @RequestParam(required=false) String keyword) {
        return ApiResponse.ok(service.list(page, Math.min(pageSize, 100), keyword));
    }
    @PostMapping("/trips")
    public ApiResponse<Trip> create(@Valid @RequestBody TripRequest request) {
        return ApiResponse.ok(service.create(toTrip(request)));
    }
    @GetMapping("/trips/{id}")
    public ApiResponse<Trip> get(@PathVariable Long id) { return ApiResponse.ok(service.get(id)); }
    @PutMapping("/trips/{id}")
    public ApiResponse<Trip> update(@PathVariable Long id, @Valid @RequestBody TripRequest request) {
        return ApiResponse.ok(service.update(id, toTrip(request)));
    }
    @PatchMapping("/trips/{id}/status")
    public ApiResponse<Trip> status(@PathVariable Long id, @Valid @RequestBody StatusRequest request) {
        return ApiResponse.ok(service.updateStatus(id, request.status()));
    }
    @GetMapping("/trips/{id}/dashboard")
    public ApiResponse<Map<String,Object>> dashboard(@PathVariable Long id) { return ApiResponse.ok(service.dashboard(id)); }

    @GetMapping("/trips/{tripId}/stops")
    public ApiResponse<List<TripStop>> stops(@PathVariable Long tripId) { return ApiResponse.ok(service.stops(tripId)); }
    @PostMapping("/trips/{tripId}/stops")
    public ApiResponse<TripStop> createStop(@PathVariable Long tripId, @Valid @RequestBody StopRequest request) {
        return ApiResponse.ok(service.createStop(tripId, toStop(request)));
    }
    @PutMapping("/stops/{id}")
    public ApiResponse<TripStop> updateStop(@PathVariable Long id, @Valid @RequestBody StopRequest request) {
        return ApiResponse.ok(service.updateStop(id, toStop(request)));
    }
    @DeleteMapping("/stops/{id}")
    public ApiResponse<Void> deleteStop(@PathVariable Long id) { service.deleteStop(id); return ApiResponse.ok(); }
    @PutMapping("/trips/{tripId}/stops/reorder")
    public ApiResponse<Void> reorder(@PathVariable Long tripId, @Valid @RequestBody ReorderRequest request) {
        service.reorderStops(tripId, request.orderedIds()); return ApiResponse.ok();
    }

    private Trip toTrip(TripRequest request) {
        Trip trip = new Trip();
        BeanUtils.copyProperties(request, trip);
        trip.setThemeKey(themePresetService.validateSelection(request.themeKey()));
        return trip;
    }
    private TripStop toStop(StopRequest request) {
        TripStop stop = new TripStop();
        BeanUtils.copyProperties(request, stop);
        return stop;
    }
}
