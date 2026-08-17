package com.thx.traveljournal.media.controller;

import com.thx.traveljournal.common.api.ApiResponse;
import com.thx.traveljournal.journal.service.JournalPreviewService;
import com.thx.traveljournal.media.entity.JournalMedia;
import com.thx.traveljournal.media.service.MediaService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
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
    private final JournalPreviewService previewService;

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
    /** 按 EXIF 拍摄时间重排图片。手机相册多选上传后顺序常常是乱的。 */
    @PutMapping("/api/admin/journals/{journalId}/media/sort-by-capture-time")
    public ApiResponse<Integer> sortByCaptureTime(@PathVariable Long journalId) {
        return ApiResponse.ok(service.sortByCaptureTime(journalId));
    }

    /** 按图片 GPS 推荐城市。只做建议，前端提示后由用户决定是否采纳。 */
    @GetMapping("/api/admin/journals/{journalId}/media/suggest-city")
    public ApiResponse<MediaService.CitySuggestion> suggestCity(@PathVariable Long journalId) {
        return ApiResponse.ok(service.suggestCity(journalId));
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

    /**
     * 302 跳转到对象存储的预签名地址，图片流量不经过应用本身。
     *
     * <p>缓存策略见 {@link #cachePolicyFor}：这个接口是权限关口，每次访问都要经过它，
     * 图片内容的复用交给下游。{@code private} 是因为跳转目标是带签名的个人化地址，
     * 不能被 CDN 或任何共享缓存留下。</p>
     */
    @GetMapping("/api/media/{mediaId}/{variant}")
    public ResponseEntity<Void> access(@PathVariable Long mediaId, @PathVariable String variant,
                                       @RequestParam(required = false) String previewToken,
                                       Authentication authentication) {
        boolean admin = authentication != null && authentication.isAuthenticated()
                && !(authentication instanceof AnonymousAuthenticationToken);
        // 草稿预览链接同时授权它那一篇日记的图片，否则预览出来是一整篇裂图
        Long previewJournalId = previewToken == null || previewToken.isBlank()
                ? null : previewService.resolveJournalId(previewToken);
        URI location = service.access(mediaId, variant, admin, previewJournalId);
        return ResponseEntity.status(302)
                .cacheControl(cachePolicyFor(mediaId, variant, admin, previewJournalId))
                .location(location).build();
    }

    /**
     * 这次响应能不能被缓存。
     *
     * <p>公开图片和私有图片共用同一个 URL，能不能留在本地取决于这张图本身公不公开，
     * 而不是这次请求碰巧成功了没有。管理员在后台看的草稿图如果被 Service Worker
     * 存进 Cache Storage，退出登录之后 cache-first 还会把它取出来——那时已经没有
     * 任何一层会再去问服务端「你现在还有权看吗」。</p>
     *
     * <p>原图只有管理员能取，预览令牌会过期也会被撤销，两者一律不留。</p>
     */
    private CacheControl cachePolicyFor(Long mediaId, String variant, boolean admin, Long previewJournalId) {
        if (previewJournalId != null || "original".equals(variant)) return CacheControl.noStore();
        // 匿名能拿到就说明它是公开的，不必再查一次；管理员身份下才需要确认
        if (admin && !service.publiclyVisible(mediaId)) return CacheControl.noStore();
        /*
         * 公开图片：可以存，但每次都要回来问一次。
         *
         * 图片内容永远不变（换图会换 id），权限却是会变的——作者随时可能撤回发布。
         * 以前这里给的是几十分钟的 max-age，于是撤回之后那几十分钟里，任何缓存过的
         * 浏览器仍然照常显示它，撤回等于没做。
         *
         * no-cache 不是「不缓存」，是「用之前必须校验」：内容照旧留在本地，但每次
         * 使用前都要经过这个接口的权限判断。真正的内容复用交给下游的 If-None-Match
         * ——校验通过时对象存储回一个 304，只有几百字节。
         */
        return CacheControl.noCache().cachePrivate();
    }
}
