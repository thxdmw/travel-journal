package com.thx.traveljournal.auth.service;

import com.thx.traveljournal.auth.entity.AdminUser;
import com.thx.traveljournal.auth.mapper.AdminUserMapper;
import com.thx.traveljournal.common.exception.BusinessException;
import com.thx.traveljournal.config.AppProperties;
import io.minio.MinioClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AdminProfileServiceTest {
    private AdminUserMapper mapper;
    private AdminProfileService service;
    private AdminUser user;

    @BeforeEach
    void setUp() {
        mapper = mock(AdminUserMapper.class);
        AppProperties properties = new AppProperties("http://localhost", null,
                new AppProperties.Upload(20, 50, 40_000_000),
                new AppProperties.Minio("http://localhost:9000", "key", "secret", "travel", 30));
        service = new AdminProfileService(mapper, mock(MinioClient.class), properties);
        user = new AdminUser();
        user.setId(1L);
        user.setUsername("admin");
        user.setThemeKey("preset-spring");
        when(mapper.selectOne(any())).thenReturn(user);
    }

    @Test
    void shouldUpdateSupportedTheme() {
        user.setThemeKey("something-else");

        AdminUser updated = service.updateTheme("admin", "preset-spring", null);

        assertThat(updated.getThemeKey()).isEqualTo("preset-spring");
        // 手动挑了一套就该锁住，之后季节更替不再改动它
        assertThat(updated.getThemeMode()).isEqualTo("FIXED");
        verify(mapper).updateById(user);
    }

    @Test
    void shouldRejectUnknownTheme() {
        assertThatThrownBy(() -> service.updateTheme("admin", "unknown", null))
                .isInstanceOf(BusinessException.class)
                .hasMessage("主题不存在");
    }

    /** 切回跟随季节时不该要求也不该校验 themeKey——那时用哪套由日期决定。 */
    @Test
    void shouldSwitchToSeasonalModeWithoutThemeKey() {
        user.setThemeKey("preset-spring");

        AdminUser updated = service.updateTheme("admin", null, "AUTO");

        assertThat(updated.getThemeMode()).isEqualTo("AUTO");
        // 上次挑的那套留着，之后切回固定模式还用得上
        assertThat(updated.getThemeKey()).isEqualTo("preset-spring");
        verify(mapper).updateById(user);
    }

    @Test
    void shouldBuildVersionedPublicAvatarUrl() {
        user.setAvatarObjectKey("profile/1/avatar-test.webp");

        assertThat(service.avatarUrl(user))
                .startsWith("/api/public/profile/avatar?v=");
    }
}
