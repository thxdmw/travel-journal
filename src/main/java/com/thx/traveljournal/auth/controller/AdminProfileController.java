package com.thx.traveljournal.auth.controller;

import com.thx.traveljournal.auth.entity.AdminUser;
import com.thx.traveljournal.auth.service.AdminProfileService;
import com.thx.traveljournal.common.api.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

/** 管理员个人资料接口：头像上传和全站主题切换。 */
@RestController
@RequestMapping("/api/admin/profile")
@RequiredArgsConstructor
public class AdminProfileController {
    private final AdminProfileService service;

    /**
     * 切换全站主题。
     *
     * <p>{@code mode} 传 AUTO 表示跟随季节，此时 themeKey 可以缺席；不传或传 FIXED
     * 表示锁定 themeKey 指定的那一套。所以 themeKey 不能标 {@code @NotBlank}。</p>
     */
    public record ThemeRequest(String themeKey, String mode) {}
    public record DisplayNameRequest(@NotBlank @Size(max = 60) String displayName) {}
    public record ProfileUpdate(String displayName, String avatarUrl, String themeKey, String themeMode) {}

    @PostMapping("/avatar")
    public ApiResponse<ProfileUpdate> uploadAvatar(@RequestParam("file") MultipartFile file,
                                                    Authentication authentication) {
        return ApiResponse.ok(view(service.uploadAvatar(authentication.getName(), file)));
    }

    @PutMapping("/theme")
    public ApiResponse<ProfileUpdate> updateTheme(@Valid @RequestBody ThemeRequest request,
                                                   Authentication authentication) {
        return ApiResponse.ok(view(service.updateTheme(authentication.getName(),
                request.themeKey(), request.mode())));
    }

    /** 修改前台展示的昵称。用户名是登录凭据，不在这里改。 */
    @PutMapping("/display-name")
    public ApiResponse<ProfileUpdate> updateDisplayName(@Valid @RequestBody DisplayNameRequest request,
                                                        Authentication authentication) {
        return ApiResponse.ok(view(service.updateDisplayName(authentication.getName(), request.displayName())));
    }

    private ProfileUpdate view(AdminUser user) {
        return new ProfileUpdate(user.getDisplayName(), service.avatarUrl(user),
                user.getThemeKey(), user.getThemeMode());
    }
}
