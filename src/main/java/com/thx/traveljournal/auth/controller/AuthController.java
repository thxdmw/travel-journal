package com.thx.traveljournal.auth.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.thx.traveljournal.auth.entity.AdminUser;
import com.thx.traveljournal.auth.mapper.AdminUserMapper;
import com.thx.traveljournal.auth.service.LoginAttemptService;
import com.thx.traveljournal.common.api.ApiResponse;
import com.thx.traveljournal.common.exception.BusinessException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;

/**
 * 后台登录相关接口：登录、登出、会话查询和改密。
 *
 * <p>用会话（Session）而不是 Token，配合 CSRF 双提交 Cookie。
 * {@code /session} 允许匿名访问，用来让前端判断是否需要跳登录页。</p>
 */
@RestController
@RequestMapping("/api/admin/auth")
@RequiredArgsConstructor
public class AuthController {
    private final AuthenticationManager authenticationManager;
    private final SecurityContextRepository contextRepository;
    private final AdminUserMapper mapper;
    private final PasswordEncoder passwordEncoder;
    private final LoginAttemptService attempts;

    public record LoginRequest(@NotBlank String username, @NotBlank String password) {}
    public record ChangePasswordRequest(@NotBlank String currentPassword,
                                        @NotBlank @Size(min = 8, max = 128) String newPassword) {}
    public record AdminInfo(Long id, String username, String displayName, String avatarUrl, String themeKey) {}

    @PostMapping("/login")
    @Transactional
    /** 登录。失败会计入 IP 失败次数；用户名不存在和密码错误返回同样的提示，不暴露账号是否存在。 */
    public ApiResponse<AdminInfo> login(@Valid @RequestBody LoginRequest body,
                                        HttpServletRequest request, HttpServletResponse response) {
        String ip = clientIp(request);
        attempts.check(ip);
        try {
            Authentication auth = authenticationManager.authenticate(
                    UsernamePasswordAuthenticationToken.unauthenticated(body.username(), body.password()));
            SecurityContext context = SecurityContextHolder.createEmptyContext();
            context.setAuthentication(auth);
            SecurityContextHolder.setContext(context);
            contextRepository.saveContext(context, request, response);
            attempts.success(ip);
            AdminUser user = find(body.username());
            user.setLastLoginAt(OffsetDateTime.now(ZoneOffset.UTC));
            mapper.updateById(user);
            return ApiResponse.ok(toInfo(user));
        } catch (BadCredentialsException ex) {
            attempts.failed(ip);
            throw new BusinessException("INVALID_CREDENTIALS", "用户名或密码错误", HttpStatus.UNAUTHORIZED);
        }
    }

    @PostMapping("/logout")
    public ApiResponse<Void> logout(HttpServletRequest request, HttpServletResponse response,
                                    Authentication authentication) {
        new SecurityContextLogoutHandler().logout(request, response, authentication);
        return ApiResponse.ok();
    }

    @GetMapping("/me")
    public ApiResponse<AdminInfo> me(Authentication authentication) {
        return ApiResponse.ok(toInfo(find(authentication.getName())));
    }

    @GetMapping("/session")
    /** 查询当前会话。未登录时返回 data 为 null 而不是 401，避免前端首屏出现无意义的报错。 */
    public ApiResponse<AdminInfo> session(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()
                || authentication instanceof AnonymousAuthenticationToken) {
            return ApiResponse.ok(null);
        }
        return ApiResponse.ok(toInfo(find(authentication.getName())));
    }

    @PostMapping("/change-password")
    @Transactional
    public ApiResponse<Void> changePassword(@Valid @RequestBody ChangePasswordRequest body,
                                            Authentication authentication) {
        AdminUser user = find(authentication.getName());
        if (!passwordEncoder.matches(body.currentPassword(), user.getPasswordHash())) {
            throw BusinessException.badRequest("当前密码不正确");
        }
        user.setPasswordHash(passwordEncoder.encode(body.newPassword()));
        mapper.updateById(user);
        return ApiResponse.ok();
    }

    private AdminUser find(String username) {
        AdminUser user = mapper.selectOne(new LambdaQueryWrapper<AdminUser>().eq(AdminUser::getUsername, username));
        if (user == null) throw BusinessException.notFound("管理员不存在");
        return user;
    }

    /** 转成给前端的账号信息。头像地址带上对象键的哈希做版本号，换头像后能立刻刷掉浏览器缓存。 */
    private AdminInfo toInfo(AdminUser user) {
        String avatarUrl = user.getAvatarObjectKey() == null ? null
                : "/api/public/profile/avatar?v=" + Integer.toUnsignedString(user.getAvatarObjectKey().hashCode());
        String themeKey = user.getThemeKey() == null ? "travel-classic" : user.getThemeKey();
        return new AdminInfo(user.getId(), user.getUsername(), user.getDisplayName(), avatarUrl, themeKey);
    }

    /** 取客户端 IP。部署在反向代理后面时以 X-Forwarded-For 的第一段为准。 */
    private String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        return forwarded == null ? request.getRemoteAddr() : forwarded.split(",")[0].trim();
    }
}
