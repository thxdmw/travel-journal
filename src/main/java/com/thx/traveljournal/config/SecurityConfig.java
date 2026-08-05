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
            .authorizeHttpRequests(auth -> auth
                    .requestMatchers("/", "/index.html", "/admin", "/admin/", "/admin/index.html",
                            "/css/**", "/js/**", "/favicon.ico", "/api/public/**", "/api/media/**",
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
