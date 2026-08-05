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
        user.setThemeKey("travel-classic");
        when(mapper.selectOne(any())).thenReturn(user);
    }

    @Test
    void shouldUpdateSupportedTheme() {
        AdminUser updated = service.updateTheme("admin", "sanya-breeze");

        assertThat(updated.getThemeKey()).isEqualTo("sanya-breeze");
        verify(mapper).updateById(user);
    }

    @Test
    void shouldRejectUnknownTheme() {
        assertThatThrownBy(() -> service.updateTheme("admin", "unknown"))
                .isInstanceOf(BusinessException.class)
                .hasMessage("主题不存在");
    }

    @Test
    void shouldBuildVersionedPublicAvatarUrl() {
        user.setAvatarObjectKey("profile/1/avatar-test.webp");

        assertThat(service.avatarUrl(user))
                .startsWith("/api/public/profile/avatar?v=");
    }
}
