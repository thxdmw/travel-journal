package com.thx.traveljournal.journal.controller;

import com.fasterxml.jackson.databind.JsonNode;

import com.thx.traveljournal.common.api.ApiResponse;
import com.thx.traveljournal.common.api.PageResponse;
import com.thx.traveljournal.journal.entity.JournalEntry;
import com.thx.traveljournal.journal.service.JournalService;
import com.thx.traveljournal.journal.service.JournalPreviewService;
import com.thx.traveljournal.journal.service.JournalTagService;
import com.thx.traveljournal.theme.service.ThemePresetService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * 后台日记接口：日记的增删改查、发布与撤回。
 *
 * <p>前台只读接口在 PublicContentController，这里的所有路径都需要管理员登录。</p>
 */
@RestController
@RequestMapping("/api/admin/journals")
@RequiredArgsConstructor
public class AdminJournalController {
    private final JournalService service;
    private final ThemePresetService themePresetService;
    private final JournalTagService tagService;
    private final JournalPreviewService previewService;

    /**
     * 日记新建和更新的请求体。
     *
     * <p>用 record 接参数意味着请求体里多余的字段会被直接忽略，前端表单残留的
     * id、createdAt 之类字段不会写进数据库。</p>
     *
     * @param tripId           所属旅行，必填
     * @param tripStopId       可选的所属城市，必须属于同一次旅行
     * @param slug             前台访问用的唯一短链，只允许小写字母、数字和短横线
     * @param contentJson      Block 正文文档，草稿允许为空文档但不能为 null
     */
    public record TagNameRequest(@NotBlank @Size(max=40) String name) {}

    public record JournalRequest(@NotNull(message = "请选择所属旅行") Long tripId, Long tripStopId,
                                 @NotBlank(message = "请填写日记标题") @Size(max=200) String title,
                                 @NotBlank(message = "请填写 Slug") @Size(max=220) String slug,
                                 @Size(max=500) String excerpt,
                                 @NotNull JsonNode contentJson,
                                 @NotNull(message = "请选择发生日期") LocalDate occurredOn,
                                 Long coverMediaId,
                                 @Size(max=80) String themeKey,
                                 Long templateId,
                                 Integer templateVersion,
                                 /** 标签名列表，传 null 表示不改动标签，传空列表表示清空 */
                                 List<String> tags) {}

    /**
     * 开一篇空草稿的请求体，三个字段都可以缺席。
     *
     * <p>编辑器一打开就调它，好让拍照、打字和自动保存立刻有 id 可用。</p>
     */
    public record DraftRequest(Long tripId, Long tripStopId, LocalDate occurredOn) {}

    /**
     * 草稿自动保存的请求体。字段与 {@link JournalRequest} 一致，但全部可选。
     *
     * <p>草稿和发布是两套标准：这里只做长度这类格式约束，缺席的字段沿用库里的旧值，
     * 空标题、空正文都放行；标题、日期、正文非空这些要求留到发布时再查。</p>
     */
    public record JournalDraftRequest(Long tripId, Long tripStopId,
                                      @Size(max=200) String title,
                                      @Size(max=220) String slug,
                                      @Size(max=500) String excerpt,
                                      JsonNode contentJson,
                                      LocalDate occurredOn,
                                      Long coverMediaId,
                                      @Size(max=80) String themeKey,
                                      Long templateId,
                                      Integer templateVersion,
                                      List<String> tags) {}

    @GetMapping
    public ApiResponse<PageResponse<JournalEntry>> list(@RequestParam(defaultValue="1") long page,
                                                        @RequestParam(defaultValue="20") long pageSize,
                                                        @RequestParam(required=false) Long tripId,
                                                        @RequestParam(required=false) String status,
                                                        @RequestParam(required=false) String keyword) {
        return ApiResponse.ok(service.list(page, Math.min(pageSize, 100), tripId, status, keyword));
    }
    @PostMapping
    public ApiResponse<JournalEntry> create(@Valid @RequestBody JournalRequest request) {
        JournalEntry created = service.create(toEntity(request));
        tagService.replaceTags(created.getId(), request.tags());
        created.setTags(tagService.namesOf(created.getId()));
        return ApiResponse.ok(created);
    }
    /** 开一篇空草稿并立刻返回 id，编辑器据此挂上自动保存和图片上传。 */
    @PostMapping("/draft")
    public ApiResponse<JournalEntry> createDraft(@RequestBody(required = false) DraftRequest request) {
        DraftRequest body = request == null ? new DraftRequest(null, null, null) : request;
        JournalEntry created = service.createDraft(body.tripId(), body.tripStopId(), body.occurredOn());
        created.setTags(List.of());
        return ApiResponse.ok(created);
    }

    /** 草稿自动保存。只对 DRAFT 状态开放，公开文章的改动仍然要走 {@link #update}。 */
    @PatchMapping("/{id}/draft")
    public ApiResponse<JournalEntry> saveDraft(@PathVariable Long id,
                                               @Valid @RequestBody JournalDraftRequest request) {
        JournalEntry updated = service.updateDraft(id, toEntity(request));
        if (request.tags() != null) tagService.replaceTags(id, request.tags());
        updated.setTags(tagService.namesOf(id));
        return ApiResponse.ok(updated);
    }

    /**
     * 丢弃一篇没写任何东西的草稿，用于「打开编辑器又直接退出」。
     *
     * <p>是否真的为空由服务端判断，返回 {@code discarded} 说明有没有删。</p>
     */
    @DeleteMapping("/{id}/discard-empty")
    public ApiResponse<Map<String, Object>> discardEmpty(@PathVariable Long id) {
        return ApiResponse.ok(Map.of("discarded", service.discardIfEmpty(id)));
    }

    @GetMapping("/{id}")
    public ApiResponse<JournalEntry> get(@PathVariable Long id) {
        JournalEntry entry = service.get(id);
        entry.setTags(tagService.namesOf(id));
        return ApiResponse.ok(entry);
    }
    @PutMapping("/{id}")
    public ApiResponse<JournalEntry> update(@PathVariable Long id, @Valid @RequestBody JournalRequest request) {
        JournalEntry updated = service.update(id, toEntity(request));
        tagService.replaceTags(id, request.tags());
        updated.setTags(tagService.namesOf(id));
        return ApiResponse.ok(updated);
    }

    /** 日记下的图片张数，前端删除前调用，用于在确认弹窗里说明会连带删除多少张图。 */
    @GetMapping("/{id}/media-count")
    public ApiResponse<Map<String, Object>> mediaCount(@PathVariable Long id) {
        return ApiResponse.ok(Map.of("count", service.mediaCount(id)));
    }

    /** 删除日记及其全部图片，返回一并删除的图片张数。 */
    @DeleteMapping("/{id}")
    public ApiResponse<Map<String, Object>> delete(@PathVariable Long id) {
        return ApiResponse.ok(Map.of("removedMedia", service.delete(id)));
    }
    /** 标签列表（含草稿引用数），供标签管理页使用。 */
    @GetMapping("/tags")
    public ApiResponse<List<JournalTagService.TagView>> tags() {
        return ApiResponse.ok(tagService.allTags());
    }

    /** 重命名标签；新名字已存在时自动合并过去。返回最终生效的标签 id。 */
    @PutMapping("/tags/{tagId}")
    public ApiResponse<Long> renameTag(@PathVariable Long tagId, @Valid @RequestBody TagNameRequest request) {
        return ApiResponse.ok(tagService.rename(tagId, request.name()));
    }

    /** 把一个标签并入另一个。 */
    @PostMapping("/tags/{sourceId}/merge-into/{targetId}")
    public ApiResponse<Void> mergeTag(@PathVariable Long sourceId, @PathVariable Long targetId) {
        tagService.merge(sourceId, targetId);
        return ApiResponse.ok();
    }

    @DeleteMapping("/tags/{tagId}")
    public ApiResponse<Void> deleteTag(@PathVariable Long tagId) {
        tagService.delete(tagId);
        return ApiResponse.ok();
    }

    /** 清理没有任何日记引用的标签，返回清理数量。 */
    @PostMapping("/tags/purge-unused")
    public ApiResponse<Integer> purgeUnusedTags() {
        return ApiResponse.ok(tagService.purgeUnused());
    }

    /** 签发草稿预览链接，48 小时有效；重复调用会让上一个链接立刻失效。 */
    @PostMapping("/{id}/preview-link")
    public ApiResponse<JournalPreviewService.PreviewLink> previewLink(@PathVariable Long id) {
        return ApiResponse.ok(previewService.issue(id));
    }

    /** 作废该日记的全部预览链接。 */
    @DeleteMapping("/{id}/preview-link")
    public ApiResponse<Void> revokePreview(@PathVariable Long id) {
        previewService.revoke(id);
        return ApiResponse.ok();
    }

    @PostMapping("/{id}/publish")
    public ApiResponse<JournalEntry> publish(@PathVariable Long id) { return ApiResponse.ok(service.publish(id)); }
    @PostMapping("/{id}/unpublish")
    public ApiResponse<JournalEntry> unpublish(@PathVariable Long id) { return ApiResponse.ok(service.unpublish(id)); }

    /** 把请求体转成实体，顺便校验并归一化主题选择（选了不存在或已停用的主题会被拒绝）。 */
    private JournalEntry toEntity(JournalRequest request) {
        JournalEntry entity = new JournalEntry();
        BeanUtils.copyProperties(request, entity);
        entity.setThemeKey(themePresetService.validateSelection(request.themeKey()));
        return entity;
    }

    /** 草稿版本的转换，字段可以是 null，缺席部分由 {@link JournalService#updateDraft} 沿用旧值。 */
    private JournalEntry toEntity(JournalDraftRequest request) {
        JournalEntry entity = new JournalEntry();
        BeanUtils.copyProperties(request, entity);
        entity.setThemeKey(themePresetService.validateSelection(request.themeKey()));
        return entity;
    }
}
