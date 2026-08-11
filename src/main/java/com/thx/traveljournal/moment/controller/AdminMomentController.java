package com.thx.traveljournal.moment.controller;

import com.thx.traveljournal.common.api.ApiResponse;
import com.thx.traveljournal.media.service.MediaService;
import com.thx.traveljournal.moment.entity.Moment;
import com.thx.traveljournal.moment.service.DayRouteService;
import com.thx.traveljournal.moment.service.MomentComposer;
import com.thx.traveljournal.moment.service.MomentNarrativeService;
import com.thx.traveljournal.moment.service.MomentService;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

/**
 * 随手记接口。
 *
 * <p>写入路径刻意做得很宽松：除了「属于哪次旅行」之外没有必填项。任何一个校验失败
 * 弹窗都会让「二十秒记完」这件事失败，而记不下来的那一条就永远不存在了。</p>
 */
@RestController
@RequestMapping("/api/admin/moments")
@RequiredArgsConstructor
public class AdminMomentController {
    private final MomentService service;
    private final MomentComposer composer;
    private final DayRouteService dayRouteService;
    private final MomentNarrativeService narrativeService;

    /** 新建或修改一条。字段全部可选，缺的沿用旧值或由服务端补默认。 */
    public record MomentRequest(String clientId, Long tripId, Long tripStopId, OffsetDateTime occurredAt,
                                LocalDate occurredLocalDate, String occurredZoneId, Integer utcOffsetMinutes,
                                @Size(max = 2000) String content,
                                @Size(max = 120) String placeName,
                                BigDecimal latitude, BigDecimal longitude,
                                @Size(max = 40) String mood) {
        Moment toEntity() {
            Moment moment = new Moment();
            moment.setClientId(clientId);
            moment.setTripId(tripId);
            moment.setTripStopId(tripStopId);
            moment.setOccurredAt(occurredAt);
            moment.setOccurredLocalDate(occurredLocalDate);
            moment.setOccurredZoneId(occurredZoneId);
            moment.setUtcOffsetMinutes(utcOffsetMinutes);
            moment.setContent(content);
            moment.setPlaceName(placeName);
            moment.setLatitude(latitude);
            moment.setLongitude(longitude);
            moment.setMood(mood);
            return moment;
        }
    }

    /**
     * 整理成日记。
     *
     * @param replace true 时用生成的内容替换正文；默认追加，免得把已经写好的部分冲掉
     */
    public record ComposeRequest(@NotNull Long tripId,
                                 @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate day,
                                 Long journalId, Boolean replace, Boolean useAi) {}

    @GetMapping
    public ApiResponse<List<MomentService.MomentView>> list(
            @RequestParam Long tripId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate day,
            @RequestParam(defaultValue = "false") boolean unsorted) {
        return ApiResponse.ok(service.list(tripId, day, unsorted));
    }

    /** 每天还有多少条没整理，旅行工作台用它提示「今天有 6 条待整理」。 */
    @GetMapping("/unsorted-count")
    public ApiResponse<Map<LocalDate, Long>> unsortedCount(@RequestParam Long tripId) {
        return ApiResponse.ok(service.unsortedCountByDay(tripId));
    }

    @GetMapping("/{id}")
    public ApiResponse<MomentService.MomentView> get(@PathVariable Long id) {
        return ApiResponse.ok(service.view(id));
    }

    @PostMapping
    public ApiResponse<MomentService.MomentView> create(@RequestBody MomentRequest request) {
        return ApiResponse.ok(service.view(service.create(request.toEntity()).getId()));
    }

    @PutMapping("/{id}")
    public ApiResponse<MomentService.MomentView> update(@PathVariable Long id, @RequestBody MomentRequest request) {
        return ApiResponse.ok(service.view(service.update(id, request.toEntity()).getId()));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ApiResponse.ok();
    }

    @PostMapping("/{id}/media")
    public ApiResponse<MediaService.MediaView> addPhoto(@PathVariable Long id,
                                                        @RequestParam(required = false) String clientId,
                                                        @RequestPart("file") MultipartFile file) {
        return ApiResponse.ok(service.addPhoto(id, clientId, file));
    }

    @DeleteMapping("/{id}/media/{mediaId}")
    public ApiResponse<Void> removePhoto(@PathVariable Long id, @PathVariable Long mediaId) {
        service.removePhoto(id, mediaId);
        return ApiResponse.ok();
    }

    /**
     * 某一天的路线。整理成日记之前先看一眼当天是怎么走的，往往能想起漏记了什么。
     * 和公开端用的是同一份计算，只是这里不要求随手记已经整理过。
     */
    @GetMapping("/route")
    public ApiResponse<List<DayRouteService.RoutePoint>> route(
            @RequestParam Long tripId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate day) {
        return ApiResponse.ok(dayRouteService.forDay(tripId, day));
    }

    @PostMapping("/compose")
    public ApiResponse<MomentComposer.ComposeResult> compose(@RequestBody ComposeRequest request) {
        return ApiResponse.ok(composer.compose(request.tripId(), request.day(), request.journalId(),
                Boolean.TRUE.equals(request.replace()), Boolean.TRUE.equals(request.useAi())));
    }

    /**
     * AI 润色是否可用。没配 app.ai.api-key 时返回 false，前端就不显示那个选项——
     * 与其让作者点了才发现没反应，不如一开始就不给这个按钮。
     */
    @GetMapping("/ai-status")
    public ApiResponse<Map<String, Boolean>> aiStatus() {
        return ApiResponse.ok(Map.of("available", narrativeService.available()));
    }
}
