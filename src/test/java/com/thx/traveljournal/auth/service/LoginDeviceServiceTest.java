package com.thx.traveljournal.auth.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 设备名识别。
 *
 * <p>「已登录设备」列表要回答的问题是「哪一台是我现在拿着的手机」，所以只做粗粒度识别，
 * 不引入 UA 解析库。但顺序必须对：Edge 的 UA 里同时带 Chrome 和 Safari，Chrome 的 UA 里
 * 也带 Safari，判断顺序写反了整列都会显示成 Safari。</p>
 */
class LoginDeviceServiceTest {

    @Test
    void iphoneSafariIsRecognised() {
        String ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 "
                + "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

        assertThat(LoginDeviceService.describe(ua)).isEqualTo("iPhone · Safari");
    }

    @Test
    void edgeIsNotMistakenForChromeOrSafari() {
        String ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
                + "Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0";

        assertThat(LoginDeviceService.describe(ua)).isEqualTo("Windows · Edge");
    }

    @Test
    void chromeIsNotMistakenForSafari() {
        String ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) "
                + "Chrome/120.0.0.0 Safari/537.36";

        assertThat(LoginDeviceService.describe(ua)).isEqualTo("Mac · Chrome");
    }

    @Test
    void androidChromeIsRecognised() {
        String ua = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) "
                + "Chrome/120.0.0.0 Mobile Safari/537.36";

        // Android 要排在 Linux 前面，否则手机会被显示成 Linux
        assertThat(LoginDeviceService.describe(ua)).isEqualTo("Android · Chrome");
    }

    @Test
    void missingUserAgentDegradesInsteadOfFailing() {
        assertThat(LoginDeviceService.describe(null)).isEqualTo("未知设备");
        assertThat(LoginDeviceService.describe("  ")).isEqualTo("未知设备");
    }
}
