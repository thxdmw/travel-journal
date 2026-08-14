package com.thx.traveljournal.auth.service;

import com.thx.traveljournal.common.exception.BusinessException;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
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

    @Test
    void trackedIpsAreBounded() {
        LoginAttemptService service = new LoginAttemptService();
        // 一轮换着源地址的扫描不该把这张表撑到内存耗尽
        for (int i = 0; i < 20_000; i++) service.failed("10.0." + (i / 250) + "." + (i % 250));

        assertThat(service.trackedIpCount()).isLessThanOrEqualTo(10_000);
    }

    @Test
    void checkingAnUnknownIpDoesNotCreateAnEntry() {
        LoginAttemptService service = new LoginAttemptService();

        service.check("203.0.113.7");

        // 只是来登录一次的正常访客不该在表里留下东西
        assertThat(service.trackedIpCount()).isZero();
    }
}
