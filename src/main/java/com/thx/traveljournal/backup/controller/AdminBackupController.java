package com.thx.traveljournal.backup.controller;

import com.thx.traveljournal.backup.service.BackupService;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/** 备份导出接口。仅管理员可用（/api/admin/** 已由 SecurityConfig 统一拦截）。 */
@RestController
@RequestMapping("/api/admin/backup")
@RequiredArgsConstructor
public class AdminBackupController {
    private final BackupService service;

    /**
     * 导出全站内容为 zip。
     *
     * <p>用 {@link StreamingResponseBody} 边生成边下发，不在内存里攒完整压缩包——
     * 照片全带上时体积可能很大。</p>
     *
     * @param includePhotos 是否包含照片原图，默认包含；只要结构化数据时传 false，体积小很多
     */
    @GetMapping
    public ResponseEntity<StreamingResponseBody> export(
            @RequestParam(defaultValue = "true") boolean includePhotos) {
        String filename = service.suggestedFilename();
        StreamingResponseBody body = output -> service.writeTo(output, includePhotos);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                // 同时给 filename 和 filename*，中文和老浏览器都能正确落名
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"" + filename + "\"; filename*=UTF-8''"
                                + URLEncoder.encode(filename, StandardCharsets.UTF_8))
                .body(body);
    }
}
