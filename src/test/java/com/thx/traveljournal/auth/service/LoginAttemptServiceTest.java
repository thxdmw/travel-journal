package com.thx.traveljournal.auth.service;

import com.thx.traveljournal.common.exception.BusinessException;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

class LoginAttemptServiceTest {
    @Test
    void shouldBlockAfterTenFailures() {
        LoginAttemptService service = new LoginAttemptService();
        String ip = "127.0.0.1";
        for (int i = 0; i < 10; i++) service.failed(ip);
        assertThatThrownBy(() -> service.check(ip))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("失败次数过多");
    }

    @Test
    void successShouldClearFailures() {
        LoginAttemptService service = new LoginAttemptService();
        String ip = "127.0.0.1";
        for (int i = 0; i < 10; i++) service.failed(ip);
        service.success(ip);
        service.check(ip);
    }
}
