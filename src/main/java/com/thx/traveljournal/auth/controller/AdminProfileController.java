package com.thx.traveljournal.auth.controller;

import com.thx.traveljournal.auth.entity.AdminUser;
import com.thx.traveljournal.auth.service.AdminProfileService;
import com.thx.traveljournal.common.api.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/admin/profile")
@RequiredArgsConstructor
public class AdminProfileController {
    private final AdminProfileService service;

    public record ThemeRequest(@NotBlank String themeKey) {}
    public record ProfileUpdate(String avatarUrl, String themeKey) {}

    @PostMapping("/avatar")
    public ApiResponse<ProfileUpdate> uploadAvatar(@RequestParam("file") MultipartFile file,
                                                    Authentication authentication) {
        AdminUser user = service.uploadAvatar(authentication.getName(), file);
        return ApiResponse.ok(new ProfileUpdate(service.avatarUrl(user), user.getThemeKey()));
    }

    @PutMapping("/theme")
    public ApiResponse<ProfileUpdate> updateTheme(@Valid @RequestBody ThemeRequest request,
                                                   Authentication authentication) {
        AdminUser user = service.updateTheme(authentication.getName(), request.themeKey());
        return ApiResponse.ok(new ProfileUpdate(service.avatarUrl(user), user.getThemeKey()));
    }
}
