package com.thx.traveljournal.theme.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.thx.traveljournal.common.api.ApiResponse;
import com.thx.traveljournal.media.service.MediaService;
import com.thx.traveljournal.theme.service.ThemePresetService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

/**
 * 后台主题接口：主题的增删改和复制。
 *
 * <p>系统预设可以直接设计，但官方 definitionJson 不会被写回——改动存成 overrideJson，
 * 随时可以用 {@link #reset} 清空、回到官方默认；系统预设不能删除。</p>
 */
@RestController
@RequestMapping("/api/admin/themes")
@RequiredArgsConstructor
public class AdminThemePresetController {
    private final ThemePresetService service;
    private final MediaService mediaService;

    public record ThemeRequest(@NotBlank @Size(max = 100) String name,
                               @Size(max = 500) String description,
                               @Size(max = 64) String baseThemeKey,
                               @Size(max = 500) String previewImageUrl,
                               @NotNull JsonNode definitionJson,
                               Boolean enabled,
                               @Size(max = 256) List<@jakarta.validation.constraints.Pattern(
                                       regexp = "^[A-Za-z][A-Za-z0-9]*\\.[A-Za-z][A-Za-z0-9]*$") String> changedPaths) {}

    @GetMapping
    public ApiResponse<List<ThemePresetService.ThemeView>> list(
            @RequestParam(defaultValue = "false") boolean enabledOnly) {
        return ApiResponse.ok(service.list(enabledOnly));
    }

    /**
     * 全站主题的当前状态：是跟随季节还是固定，以及此刻实际生效的是哪一套。
     * 后台的主题选择器要用它把「跟随季节 · 夏 · 盛夏出逃」这一行显示出来。
     */
    @GetMapping("/site-state")
    public ApiResponse<ThemePresetService.SiteThemeState> siteState() {
        return ApiResponse.ok(service.siteThemeState());
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
                request.previewImageUrl(), request.definitionJson(), request.enabled(), request.changedPaths()));
    }

    /**
     * 上传首页封面图。返回的 id 由前端填进主题配置的 hero.mediaId，随主题一起保存。
     * 不挂在具体主题下，因为设计器里可能正在新建一个尚未保存的主题。
     */
    @PostMapping("/hero")
    public ApiResponse<MediaService.MediaView> uploadHero(@RequestPart("file") MultipartFile file) {
        return ApiResponse.ok(mediaService.uploadThemeHero(file));
    }

    @PostMapping("/{id}/duplicate")
    public ApiResponse<ThemePresetService.ThemeView> duplicate(@PathVariable Long id) {
        return ApiResponse.ok(service.duplicate(id));
    }

    /** 还原系统主题的官方默认：清空用户覆盖，effective 回到官方 definitionJson。 */
    @PostMapping("/{id}/reset")
    public ApiResponse<ThemePresetService.ThemeView> reset(@PathVariable Long id) {
        return ApiResponse.ok(service.resetOverride(id));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ApiResponse.ok();
    }
}
