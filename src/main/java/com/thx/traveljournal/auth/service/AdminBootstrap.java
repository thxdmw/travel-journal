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
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
@RequiredArgsConstructor
public class AdminBootstrap implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(AdminBootstrap.class);
    private final AdminUserMapper mapper;
    private final AppProperties properties;
    private final PasswordEncoder passwordEncoder;

    @Override
    public void run(ApplicationArguments args) {
        if (mapper.selectCount(Wrappers.emptyWrapper()) > 0) return;
        AppProperties.Admin config = properties.admin();
        if (!StringUtils.hasText(config.password())) {
            log.warn("管理员表为空，但未配置 APP_ADMIN_PASSWORD；请配置后重启应用");
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
}
