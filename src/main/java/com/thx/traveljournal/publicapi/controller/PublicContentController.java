package com.thx.traveljournal.publicapi.controller;

import com.thx.traveljournal.common.api.ApiResponse;
import com.thx.traveljournal.common.api.PageResponse;
import com.thx.traveljournal.journal.service.JournalTagService;
import com.thx.traveljournal.publicapi.service.PublicContentService;
import com.thx.traveljournal.publicapi.service.YearReviewService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 前台只读接口：首页、旅行、日记和地图城市点，全部无需登录。 */
@RestController
@RequestMapping("/api/public")
@RequiredArgsConstructor
public class PublicContentController {
    private final PublicContentService service;
    private final JournalTagService tagService;
    private final YearReviewService yearReviewService;

    @GetMapping("/home")
    public ApiResponse<PublicContentService.Home> home() { return ApiResponse.ok(service.home()); }
    @GetMapping("/trips")
    public ApiResponse<List<PublicContentService.TripCard>> trips() { return ApiResponse.ok(service.publicTrips()); }
    @GetMapping("/trips/{slug}")
    public ApiResponse<PublicContentService.TripDetail> trip(@PathVariable String slug) {
        return ApiResponse.ok(service.trip(slug));
    }
    /**
     * 日记列表。
     *
     * @param keyword 关键词，在标题、摘要和正文里做子串匹配
     * @param tag     标签 slug，只看这个标签下的日记
     */
    @GetMapping("/journals")
    public ApiResponse<PageResponse<PublicContentService.JournalCard>> journals(
            @RequestParam(defaultValue="1") long page, @RequestParam(defaultValue="12") long pageSize,
            @RequestParam(required=false) String keyword, @RequestParam(required=false) String tag) {
        return ApiResponse.ok(service.journals(page, Math.min(pageSize, 100), keyword, tag));
    }

    /** 标签云，只统计已发布日记。 */
    @GetMapping("/tags")
    public ApiResponse<List<JournalTagService.TagView>> tags() {
        return ApiResponse.ok(tagService.publishedTags());
    }
    @GetMapping("/journals/{slug}")
    public ApiResponse<PublicContentService.JournalDetail> journal(@PathVariable String slug) {
        return ApiResponse.ok(service.journal(slug));
    }
    /** 有已发布日记的年份，倒序。 */
    @GetMapping("/years")
    public ApiResponse<List<Integer>> years() { return ApiResponse.ok(yearReviewService.availableYears()); }

    /** 某一年的旅行回顾统计。 */
    @GetMapping("/years/{year}")
    public ApiResponse<YearReviewService.YearReview> yearReview(@PathVariable int year) {
        return ApiResponse.ok(yearReviewService.review(year));
    }

    /**
     * 草稿预览。令牌由后台签发，48 小时有效。
     *
     * <p>放在 /api/public 下但不出现在任何列表接口里：没有令牌就找不到，
     * 令牌过期即失效，草稿本身始终不进入公开索引。</p>
     */
    @GetMapping("/preview/{token}")
    public ApiResponse<PublicContentService.JournalDetail> preview(@PathVariable String token) {
        return ApiResponse.ok(service.previewByToken(token));
    }

    @GetMapping("/map/cities")
    public ApiResponse<List<PublicContentService.CityMarker>> map() { return ApiResponse.ok(service.mapCities()); }
}
