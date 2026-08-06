package com.thx.traveljournal.media.controller;

import com.thx.traveljournal.common.api.ApiResponse;
import com.thx.traveljournal.media.entity.JournalMedia;
import com.thx.traveljournal.media.service.MediaService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.net.URI;
import java.util.List;

/**
 * 图片接口：后台的上传、排序、说明、封面和删除，以及所有人都会用到的图片访问地址。
 *
 * <p>{@code /api/media/**} 对访客开放，但服务层会校验这张图是否已经通过发布的日记
 * 或公开旅行的封面对外可见，未公开的图片一律 403。</p>
 */
@RestController
@RequiredArgsConstructor
public class MediaController {
    private final MediaService service;

    public record ReorderRequest(@NotEmpty List<Long> orderedIds) {}
    public record CaptionRequest(@Size(max=500) String caption) {}

    @GetMapping("/api/admin/journals/{journalId}/media")
    public ApiResponse<List<MediaService.MediaView>> list(@PathVariable Long journalId) {
        return ApiResponse.ok(service.list(journalId));
    }
    @PostMapping("/api/admin/journals/{journalId}/media")
    public ApiResponse<MediaService.MediaView> upload(@PathVariable Long journalId,
                                                      @RequestPart("file") MultipartFile file,
                                                      @RequestParam(required=false) String caption) {
        return ApiResponse.ok(service.upload(journalId, file, caption));
    }
    @PutMapping("/api/admin/journals/{journalId}/media/reorder")
    public ApiResponse<Void> reorder(@PathVariable Long journalId, @Valid @RequestBody ReorderRequest request) {
        service.reorder(journalId, request.orderedIds()); return ApiResponse.ok();
    }
    @PatchMapping("/api/admin/journals/{journalId}/cover/{mediaId}")
    public ApiResponse<Void> cover(@PathVariable Long journalId, @PathVariable Long mediaId) {
        service.setCover(journalId, mediaId); return ApiResponse.ok();
    }
    @PutMapping("/api/admin/journal-media/{id}")
    public ApiResponse<JournalMedia> caption(@PathVariable Long id, @Valid @RequestBody CaptionRequest request) {
        return ApiResponse.ok(service.updateCaption(id, request.caption()));
    }
    @DeleteMapping("/api/admin/journal-media/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) { service.deleteRelation(id); return ApiResponse.ok(); }

    @GetMapping("/api/media/{mediaId}/{variant}")
    /** 302 跳转到对象存储的预签名地址，图片流量不经过应用本身。 */
    public ResponseEntity<Void> access(@PathVariable Long mediaId, @PathVariable String variant,
                                       Authentication authentication) {
        boolean admin = authentication != null && authentication.isAuthenticated()
                && !(authentication instanceof AnonymousAuthenticationToken);
        URI location = service.access(mediaId, variant, admin);
        return ResponseEntity.status(302).location(location).build();
    }
}
