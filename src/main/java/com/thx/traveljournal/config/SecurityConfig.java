package com.thx.traveljournal.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.thx.traveljournal.common.api.ApiResponse;
import com.thx.traveljournal.auth.service.AdminUserDetailsService;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;

import java.nio.charset.StandardCharsets;

/**
 * 安全配置：会话登录 + CSRF 双提交 Cookie。
 *
 * <p>前台页面、静态资源、公开接口和图片地址全部放行，{@code /api/admin/**} 需要 ADMIN 角色。
 * 未登录和无权限都返回统一格式的 JSON，而不是跳转登录页，方便前端 SPA 统一处理。</p>
 */
@Configuration
@RequiredArgsConstructor
public class SecurityConfig {
    private final ObjectMapper objectMapper;
    private final AdminUserDetailsService userDetailsService;

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    AuthenticationManager authenticationManager(AuthenticationConfiguration configuration) throws Exception {
        return configuration.getAuthenticationManager();
    }

    @Bean
    SecurityContextRepository securityContextRepository() {
        return new HttpSessionSecurityContextRepository();
    }

    /**
     * 主过滤器链。
     *
     * <p>登录接口本身要排除 CSRF 校验，否则首次登录时前端还拿不到令牌。
     * requestCache 关掉是因为没有登录跳转，留着反而会在会话里存无用的请求。</p>
     */
    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        CookieCsrfTokenRepository csrf = CookieCsrfTokenRepository.withHttpOnlyFalse();
        csrf.setCookiePath("/");
        http
            .userDetailsService(userDetailsService)
            .csrf(configurer -> configurer
                    .csrfTokenRepository(csrf)
                    .csrfTokenRequestHandler(new SpaCsrfTokenRequestHandler())
                    .ignoringRequestMatchers("/api/admin/auth/login"))
            .headers(headers -> headers
                    // 主题设计器要用 iframe 内嵌自己的前台页面做实时预览，而 Spring Security
                    // 默认下发 X-Frame-Options: DENY，会把同源嵌套一起拒掉。放开到同源即可，
                    // 跨站点击劫持仍然被挡住。
                    .frameOptions(frame -> frame.sameOrigin())
                    // 现代浏览器优先看 CSP 的 frame-ancestors。这里只声明这一条指令，
                    // 不会影响脚本、样式等其它资源的加载策略。
                    .contentSecurityPolicy(csp -> csp.policyDirectives("frame-ancestors 'self'")))
            .authorizeHttpRequests(auth -> auth
                    .requestMatchers("/", "/index.html", "/admin", "/admin/", "/admin/index.html",
                            "/css/**", "/js/**", "/img/**", "/vendor/**", "/assets/**",
                            // PWA：清单和 Service Worker 都必须匿名可取，装到桌面之后
                            // 是先加载它们、再谈登录状态的
                            "/manifest.json", "/service-worker.js",
                            "/favicon.ico", "/api/public/**", "/api/media/**",
                            "/api/admin/auth/login", "/api/admin/auth/session", "/actuator/health", "/actuator/info",
                            "/swagger-ui.html", "/swagger-ui/**", "/v3/api-docs/**").permitAll()
                    .requestMatchers("/api/admin/**").hasRole("ADMIN")
                    .anyRequest().permitAll())
            .exceptionHandling(ex -> ex
                    .authenticationEntryPoint((request, response, error) -> {
                        response.setStatus(401);
                        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
                        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                        objectMapper.writeValue(response.getWriter(),
                                ApiResponse.error("UNAUTHORIZED", "请先登录", null));
                    })
                    .accessDeniedHandler((request, response, error) -> {
                        response.setStatus(403);
                        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
                        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                        objectMapper.writeValue(response.getWriter(),
                                ApiResponse.error("FORBIDDEN", "没有权限执行此操作", null));
                    }))
            .requestCache(cache -> cache.disable())
            .formLogin(form -> form.disable())
            .httpBasic(basic -> basic.disable())
            .logout(logout -> logout.disable());
        return http.build();
    }
}
