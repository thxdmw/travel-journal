package com.thx.traveljournal.auth.service;

import com.thx.traveljournal.auth.mapper.AdminUserMapper;
import com.thx.traveljournal.auth.entity.AdminUser;
import com.thx.traveljournal.config.AppProperties;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class AdminBootstrapTest {
    @Test
    void productionShouldRejectMissingBootstrapPasswordWhenAdminTableIsEmpty() {
        AdminUserMapper mapper = mock(AdminUserMapper.class);
        when(mapper.selectCount(any())).thenReturn(0L);
        AdminBootstrap bootstrap = new AdminBootstrap(mapper, properties(""), mock(PasswordEncoder.class),
                productionEnvironment());

        assertThatThrownBy(() -> bootstrap.run(null))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("APP_ADMIN_PASSWORD");
        verify(mapper, never()).insert(any(AdminUser.class));
    }

    @Test
    void existingAdminShouldNotRequireBootstrapPasswordInProduction() {
        AdminUserMapper mapper = mock(AdminUserMapper.class);
        when(mapper.selectCount(any())).thenReturn(1L);
        AdminBootstrap bootstrap = new AdminBootstrap(mapper, properties("123456"), mock(PasswordEncoder.class),
                productionEnvironment());

        bootstrap.run(null);

        verify(mapper, never()).insert(any(AdminUser.class));
    }

    @Test
    void productionShouldCreateFirstAdminWithStrongPassword() {
        AdminUserMapper mapper = mock(AdminUserMapper.class);
        PasswordEncoder encoder = mock(PasswordEncoder.class);
        when(mapper.selectCount(any())).thenReturn(0L);
        when(encoder.encode("correct-horse-battery-staple")).thenReturn("encoded");
        AdminBootstrap bootstrap = new AdminBootstrap(mapper, properties("correct-horse-battery-staple"), encoder,
                productionEnvironment());

        bootstrap.run(null);

        verify(mapper).insert(argThat((AdminUser user) -> "admin".equals(user.getUsername())
                && "encoded".equals(user.getPasswordHash())));
    }

    private static AppProperties properties(String password) {
        return new AppProperties("http://localhost",
                new AppProperties.Admin("admin", password, "旅行者"),
                new AppProperties.Upload(20, 50, 50_000_000),
                new AppProperties.Minio("", "", "", "travel-journal", 60));
    }

    private static MockEnvironment productionEnvironment() {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("prod");
        return environment;
    }
}
