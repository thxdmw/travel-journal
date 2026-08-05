package com.thx.traveljournal.publicapi.controller;

import com.thx.traveljournal.auth.entity.AdminUser;
import com.thx.traveljournal.auth.service.AdminProfileService;
import com.thx.traveljournal.common.api.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/public/profile")
@RequiredArgsConstructor
public class PublicProfileController {
    private final AdminProfileService service;

    public record PublicProfile(String displayName, String avatarUrl, String themeKey) {}

    @GetMapping
    public ApiResponse<PublicProfile> profile() {
        AdminUser user = service.publicUser();
        String themeKey = user.getThemeKey() == null ? AdminProfileService.DEFAULT_THEME : user.getThemeKey();
        return ApiResponse.ok(new PublicProfile(user.getDisplayName(), service.avatarUrl(user), themeKey));
    }

    @GetMapping("/avatar")
    public ResponseEntity<Void> avatar() {
        return ResponseEntity.status(HttpStatus.FOUND)
                .header(HttpHeaders.LOCATION, service.avatarAccess(service.publicUser()).toString())
                .header(HttpHeaders.CACHE_CONTROL, "private, max-age=300")
                .build();
    }
}
