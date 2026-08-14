package com.thx.traveljournal.trip.controller;

import com.thx.traveljournal.common.api.ApiResponse;
import com.thx.traveljournal.common.api.PageResponse;
import com.thx.traveljournal.common.api.Pagination;
import com.thx.traveljournal.media.service.MediaService;
import com.thx.traveljournal.trip.entity.Trip;
import com.thx.traveljournal.trip.entity.TripStop;
import com.thx.traveljournal.trip.service.TripService;
import com.thx.traveljournal.theme.service.ThemePresetService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * 后台旅行接口：旅行本体、城市停靠点和旅行封面的管理。
 *
 * <p>按规范旅行不提供物理删除入口，不再需要的旅行改成 ARCHIVED 归档。</p>
 */
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminTripController {
    private final TripService service;
    private final ThemePresetService themePresetService;
    private final MediaService mediaService;

    /**
     * 旅行新建和更新的请求体。
     *
     * @param slug            前台访问用的唯一短链，只允许小写字母、数字和短横线
     * @param status          PLANNING / ONGOING / COMPLETED / ARCHIVED 之一
     * @param defaultCurrency 三位字母币种代码，例如 CNY
     * @param coverMediaId    封面图片 id，通过封面上传接口设置后由前端回填
     * @param themeKey        旅行专属主题，为空表示继承全站主题
     */
    public record TripRequest(@NotBlank(message = "请填写旅行标题") @Size(max=160) String title,
                              @NotBlank(message = "请填写 Slug") @Size(max=180) String slug,
                              @Size(max=1000) String summary,
                              @NotBlank(message = "请选择旅行状态") String status,
                              @NotNull(message = "请选择开始日期") LocalDate startDate,
                              @NotNull(message = "请选择结束日期") LocalDate endDate,
                              @NotBlank(message = "请填写币种")
                              @Pattern(regexp="[A-Za-z]{3}", message = "币种必须是 3 位字母，例如 CNY") String defaultCurrency,
                              Long coverMediaId, String internalNote,
                              @Size(max=80) String themeKey) {}
    public record StatusRequest(@NotBlank String status) {}

    /**
     * 城市停靠点的请求体。
     *
     * @param latitude         纬度，来自地图选点或地点搜索，不能与经度同时为 0
     * @param coordinateSystem 坐标系，GCJ02（高德）或 WGS84
     * @param locationSource   坐标来源，AMAP_SEARCH / AMAP_REVERSE / MAP_PICK / MANUAL
     */
    public record StopRequest(@NotBlank(message = "请填写城市或地点名称") @Size(max=120) String cityName,
                              @Size(max=120) String regionName,
                              @NotBlank(message = "请填写国家") @Size(max=120) String countryName,
                              @Pattern(regexp="^$|[A-Za-z]{2}", message = "国家代码必须是 2 位字母") String countryCode,
                              @NotNull(message = "请在地图上选择地点坐标") BigDecimal latitude,
                              @NotNull(message = "请在地图上选择地点坐标") BigDecimal longitude,
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
        Pagination.check(page, pageSize);
        Pagination.checkKeyword(keyword);
        return ApiResponse.ok(service.list(page, pageSize, keyword));
    }

    /**
     * 旅行选择器用的轻量列表：只有 id 和标题。
     *
     * <p>编辑器、随手记和日记管理里的「所属旅行」下拉以前直接借用分页列表的前 100 条，
     * 旅行再多就会被静默截断——下拉里找不到的旅行，作者根本不知道它还在。这里不分页，
     * 但每行只有两个字段，比拉 100 个完整旅行还轻。</p>
     */
    @GetMapping("/trips/options")
    public ApiResponse<List<TripService.TripOption>> tripOptions() {
        return ApiResponse.ok(service.options());
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

    /**
     * 直接上传一张图片作为旅行封面。
     *
     * <p>旅行封面不依附任何日记，所以新建旅行后立刻就能设封面，不用先写一篇日记。
     * 旧封面若没有其它引用会被一并清理。</p>
     */
    @PostMapping("/trips/{id}/cover")
    public ApiResponse<MediaService.MediaView> uploadCover(@PathVariable Long id,
                                                           @RequestPart("file") MultipartFile file) {
        return ApiResponse.ok(mediaService.uploadTripCover(id, file));
    }
    /** 移除旅行封面，图片没有其它引用时会一并从对象存储删除。 */
    @DeleteMapping("/trips/{id}/cover")
    public ApiResponse<Void> clearCover(@PathVariable Long id) {
        mediaService.clearTripCover(id); return ApiResponse.ok();
    }

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

    /** 请求体转实体，顺便校验主题选择是否有效。 */
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
