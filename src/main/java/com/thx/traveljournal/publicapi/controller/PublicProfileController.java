package com.thx.traveljournal.publicapi.controller;

import com.thx.traveljournal.auth.entity.AdminUser;
import com.thx.traveljournal.auth.service.AdminProfileService;
import com.thx.traveljournal.common.api.ApiResponse;
import lombok.RequiredArgsConstructor;
import com.thx.traveljournal.theme.service.ThemePresetService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 前台展示用的站长资料和当前生效的主题。 */
@RestController
@RequestMapping("/api/public/profile")
@RequiredArgsConstructor
public class PublicProfileController {
    private final AdminProfileService service;
    private final ThemePresetService themePresetService;

    public record PublicProfile(String displayName, String avatarUrl, String themeKey,
                                ThemePresetService.ThemeView theme) {}

    /**
     * 前台的站长资料和当前生效主题。
     *
     * <p>主题必须走 {@link ThemePresetService#activeSiteTheme()}，不能直接读
     * {@code user.themeKey}。「跟随季节」只把 {@code themeMode} 改成 AUTO，上一次手选的
     * {@code themeKey} 还原样留在库里——照着它 resolve 出来的是那套旧主题，于是后台显示
     * 当季主题、前台却一直停在切换之前，作者会以为前台根本没生效。</p>
     */
    @GetMapping
    public ApiResponse<PublicProfile> profile() {
        AdminUser user = service.publicUser();
        ThemePresetService.ThemeView theme = themePresetService.activeSiteTheme();
        return ApiResponse.ok(new PublicProfile(user.getDisplayName(), service.avatarUrl(user),
                theme.themeKey(), theme));
    }

    @GetMapping("/avatar")
    public ResponseEntity<Void> avatar() {
        return ResponseEntity.status(HttpStatus.FOUND)
                .header(HttpHeaders.LOCATION, service.avatarAccess(service.publicUser()).toString())
                .header(HttpHeaders.CACHE_CONTROL, "private, max-age=300")
                .build();
    }
}
