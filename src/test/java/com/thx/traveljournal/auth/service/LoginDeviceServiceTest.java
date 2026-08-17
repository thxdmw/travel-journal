package com.thx.traveljournal.auth.service;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.session.MapSession;
import org.springframework.session.Session;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

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

    /*
     * ============================================================ 同一台设备重复登录
     *
     * 手机上登录两次不该在「登录设备」里留下两条一模一样的记录：第二次登录会换一个新会话，
     * 旧那条要等 max-inactive 才过期，而那期间作者根本分不清哪条是自己现在拿着的这台。
     */

    @SuppressWarnings("unchecked")
    private FindByIndexNameSessionRepository<Session> repository() {
        return mock(FindByIndexNameSessionRepository.class);
    }

    /** 一个已经登录过的旧会话，带着设备标识。 */
    private Session sessionWithDevice(String id, String deviceId) {
        MapSession session = new MapSession(id);
        session.setAttribute(LoginDeviceService.DEVICE_ATTRIBUTE,
                Map.of("deviceName", "iPhone · Safari", "deviceId", deviceId));
        return session;
    }

    @Test
    void loggingInTwiceFromTheSameDeviceReplacesTheOldSession() {
        String phone = "11111111-1111-1111-1111-111111111111";
        FindByIndexNameSessionRepository<Session> sessions = repository();
        Map<String, Session> existing = new LinkedHashMap<>();
        // 这台手机上一次登录留下的会话
        existing.put("old-session", sessionWithDevice("old-session", phone));
        // 另一台设备的会话不该被误伤
        existing.put("other-device", sessionWithDevice("other-device",
                "22222222-2222-2222-2222-222222222222"));
        when(sessions.findByPrincipalName("admin")).thenReturn(existing);

        HttpServletRequest request = mock(HttpServletRequest.class);
        // 浏览器带着上次种下的设备 cookie 回来，说明还是同一台
        when(request.getCookies()).thenReturn(new Cookie[]{
                new Cookie(LoginDeviceService.DEVICE_COOKIE, phone)});
        when(request.getHeader("User-Agent")).thenReturn("Mozilla/5.0 (iPhone) Safari/604.1");
        HttpSession session = mock(HttpSession.class);
        when(session.getId()).thenReturn("new-session");
        ClientIpResolver ip = mock(ClientIpResolver.class);
        when(ip.resolve(any())).thenReturn("203.0.113.9");

        int removed = new LoginDeviceService(sessions, ip)
                .remember("admin", session, request, mock(HttpServletResponse.class));

        assertThat(removed).isEqualTo(1);
        verify(sessions).deleteById("old-session");
    }

    @Test
    void firstLoginIssuesADeviceCookieAndKeepsTheDeviceName() {
        FindByIndexNameSessionRepository<Session> sessions = repository();
        when(sessions.findByPrincipalName("admin")).thenReturn(Map.of());
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getCookies()).thenReturn(null);
        when(request.getHeader("User-Agent")).thenReturn(
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Version/17.5 Safari/604.1");
        HttpSession session = mock(HttpSession.class);
        when(session.getId()).thenReturn("s1");
        ClientIpResolver ip = mock(ClientIpResolver.class);
        // IP 解析不出来是常事，不该因此把人挡在登录门外
        when(ip.resolve(any())).thenReturn(null);
        HttpServletResponse response = mock(HttpServletResponse.class);

        new LoginDeviceService(sessions, ip).remember("admin", session, request, response);

        ArgumentCaptor<Cookie> cookie = ArgumentCaptor.forClass(Cookie.class);
        verify(response).addCookie(cookie.capture());
        assertThat(cookie.getValue().getName()).isEqualTo(LoginDeviceService.DEVICE_COOKIE);
        assertThat(cookie.getValue().isHttpOnly()).isTrue();

        ArgumentCaptor<Object> attribute = ArgumentCaptor.forClass(Object.class);
        verify(session).setAttribute(eqAttribute(), attribute.capture());
        @SuppressWarnings("unchecked")
        Map<String, String> device = (Map<String, String>) attribute.getValue();
        assertThat(device.get("deviceName")).isEqualTo("iPhone · Safari");
        assertThat(device.get("deviceId")).isEqualTo(cookie.getValue().getValue());
    }

    private static String eqAttribute() {
        return org.mockito.ArgumentMatchers.eq(LoginDeviceService.DEVICE_ATTRIBUTE);
    }
}
