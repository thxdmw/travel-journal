package com.thx.traveljournal.publicapi.controller;

import com.thx.traveljournal.common.api.ApiResponse;
import com.thx.traveljournal.common.api.PageResponse;
import com.thx.traveljournal.publicapi.service.PublicContentService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/public")
@RequiredArgsConstructor
public class PublicContentController {
    private final PublicContentService service;

    @GetMapping("/home")
    public ApiResponse<PublicContentService.Home> home() { return ApiResponse.ok(service.home()); }
    @GetMapping("/trips")
    public ApiResponse<List<PublicContentService.TripCard>> trips() { return ApiResponse.ok(service.publicTrips()); }
    @GetMapping("/trips/{slug}")
    public ApiResponse<PublicContentService.TripDetail> trip(@PathVariable String slug) {
        return ApiResponse.ok(service.trip(slug));
    }
    @GetMapping("/journals")
    public ApiResponse<PageResponse<PublicContentService.JournalCard>> journals(
            @RequestParam(defaultValue="1") long page, @RequestParam(defaultValue="12") long pageSize) {
        return ApiResponse.ok(service.journals(page, Math.min(pageSize, 100)));
    }
    @GetMapping("/journals/{slug}")
    public ApiResponse<PublicContentService.JournalDetail> journal(@PathVariable String slug) {
        return ApiResponse.ok(service.journal(slug));
    }
    @GetMapping("/map/cities")
    public ApiResponse<List<PublicContentService.CityMarker>> map() { return ApiResponse.ok(service.mapCities()); }
}
