package com.thx.traveljournal.auth.controller;

import com.thx.traveljournal.auth.entity.AdminUser;
import com.thx.traveljournal.auth.service.AdminProfileService;
import com.thx.traveljournal.auth.service.LoginDeviceService;
import com.thx.traveljournal.common.api.ApiResponse;
import com.thx.traveljournal.common.exception.BusinessException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

/** 管理员个人资料接口：头像上传和全站主题切换。 */
@RestController
@RequestMapping("/api/admin/profile")
@RequiredArgsConstructor
public class AdminProfileController {
    private final AdminProfileService service;
    private final LoginDeviceService devices;

    /**
     * 切换全站主题。
     *
     * <p>{@code mode} 传 AUTO 表示跟随季节，此时 themeKey 可以缺席；不传或传 FIXED
     * 表示锁定 themeKey 指定的那一套。所以 themeKey 不能标 {@code @NotBlank}。</p>
     */
    public record ThemeRequest(String themeKey, String mode) {}
    public record DisplayNameRequest(@NotBlank @Size(max = 60) String displayName) {}
    /** 设备命名。允许传空串，表示改回按 User-Agent 自动识别。 */
    public record DeviceNameRequest(@Size(max = 60) String displayName) {}
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

    /*
     * ============================================================ 登录设备
     *
     * 会话存进了数据库，所以「我在哪些设备上登录着」是可以回答的问题，而不是只能靠改密码
     * 把所有人一起踢掉。手机丢了、或者在别人电脑上登录过忘了退出，都在这里处理。
     */

    /** 当前账号的全部登录设备，最近活跃的在前。 */
    @GetMapping("/devices")
    public ApiResponse<List<LoginDeviceService.LoginDevice>> devices(Authentication authentication,
                                                                     HttpServletRequest request) {
        return ApiResponse.ok(devices.devicesOf(authentication.getName(), currentSessionId(request)));
    }

    /**
     * 让指定设备立刻掉线。
     *
     * <p>只能删自己名下的会话，删别人的一律当作不存在——不区分「没有这个会话」和
     * 「这个会话不是你的」，免得这个接口变成探测他人会话 id 是否有效的工具。</p>
     */
    @DeleteMapping("/devices/{sessionId}")
    public ApiResponse<Void> revokeDevice(@PathVariable String sessionId, Authentication authentication) {
        if (!devices.revoke(authentication.getName(), sessionId))
            throw BusinessException.notFound("这台设备已经不在登录状态");
        return ApiResponse.ok();
    }

    /**
     * 给一台设备起名字。
     *
     * <p>浏览器给不出作者自己起的设备名（「我的 iPhone」），User-Agent 最多到机型，
     * iOS 连机型都不给。所以真要一眼认出哪台是哪台，只能让作者自己命名。</p>
     *
     * <p>名字留空表示改回自动识别。</p>
     */
    @PatchMapping("/devices/{sessionId}")
    public ApiResponse<Map<String, Object>> renameDevice(@PathVariable String sessionId,
                                                         @Valid @RequestBody DeviceNameRequest request,
                                                         Authentication authentication) {
        String name = devices.rename(authentication.getName(), sessionId, request.displayName());
        return ApiResponse.ok(Map.of("deviceName", name));
    }

    /** 除当前设备外全部登出，返回踢掉的台数。 */
    @DeleteMapping("/devices")
    public ApiResponse<Map<String, Object>> revokeOtherDevices(Authentication authentication,
                                                               HttpServletRequest request) {
        int removed = devices.revokeOthers(authentication.getName(), currentSessionId(request));
        return ApiResponse.ok(Map.of("removed", removed));
    }

    /** 当前请求所属的会话 id，用来在列表里标出「本机」并避免把自己踢下线。 */
    private String currentSessionId(HttpServletRequest request) {
        return request.getSession(false) == null ? null : request.getSession(false).getId();
    }

    private ProfileUpdate view(AdminUser user) {
        return new ProfileUpdate(user.getDisplayName(), service.avatarUrl(user),
                user.getThemeKey(), user.getThemeMode());
    }
}
