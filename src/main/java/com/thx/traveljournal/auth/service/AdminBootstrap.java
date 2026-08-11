package com.thx.traveljournal.auth.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.thx.traveljournal.auth.entity.AdminUser;
import com.thx.traveljournal.auth.mapper.AdminUserMapper;
import com.thx.traveljournal.config.AppProperties;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.env.Environment;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.Arrays;
import java.util.Locale;
import java.util.Set;

/**
 * 首次启动时创建初始管理员账号。
 *
 * <p>只在管理员表为空时执行；没有配置 APP_ADMIN_PASSWORD 时只告警不创建，
 * 避免出现一个谁都能猜到密码的账号。</p>
 */
@Component
@RequiredArgsConstructor
public class AdminBootstrap implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(AdminBootstrap.class);
    private final AdminUserMapper mapper;
    private final AppProperties properties;
    private final PasswordEncoder passwordEncoder;
    private final Environment environment;

    private static final Set<String> KNOWN_WEAK_PASSWORDS = Set.of(
            "123456", "admin", "password", "change-after-first-login");

    @Override
    public void run(ApplicationArguments args) {
        if (mapper.selectCount(Wrappers.emptyWrapper()) > 0) return;
        AppProperties.Admin config = properties.admin();
        if (config == null || weak(config.password())) {
            String message = "管理员表为空，APP_ADMIN_PASSWORD 未配置或强度不足（生产环境至少 16 位且不能使用常见默认值）";
            if (production()) throw new IllegalStateException(message);
            log.warn("{}；当前不是生产环境，已跳过初始管理员创建", message);
            return;
        }
        AdminUser user = new AdminUser();
        user.setUsername(config.username());
        user.setDisplayName(config.displayName());
        user.setPasswordHash(passwordEncoder.encode(config.password()));
        user.setEnabled(true);
        mapper.insert(user);
        log.info("已创建初始管理员账号：{}", config.username());
    }

    private boolean production() {
        return Arrays.stream(environment.getActiveProfiles()).anyMatch("prod"::equalsIgnoreCase);
    }

    private static boolean weak(String password) {
        if (!StringUtils.hasText(password) || password.length() < 16) return true;
        return KNOWN_WEAK_PASSWORDS.contains(password.trim().toLowerCase(Locale.ROOT));
    }
}
