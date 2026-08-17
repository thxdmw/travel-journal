package com.thx.traveljournal.auth.service;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.session.Session;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

/**
 * 已登录设备。
 *
 * <p>会话表本身就是设备清单，所以这里不再单独建一张设备表——那样会多出「设备记录还在、
 * 会话已经过期」这种对不上的状态，还得自己写清理。删掉一个会话，那台设备下一次请求就是
 * 未登录，不存在延迟。</p>
 *
 * <p>设备名、IP 和登录时间在登录那一刻写进会话属性，之后不再变：它们描述的是「这次登录
 * 发生在哪」，不是「最近一次请求来自哪」。</p>
 */
@Service
@RequiredArgsConstructor
public class LoginDeviceService {
    /** 会话属性名，存这次登录的设备描述。 */
    static final String DEVICE_ATTRIBUTE = "travel-journal.login-device";

    private final FindByIndexNameSessionRepository<? extends Session> sessions;
    private final ClientIpResolver clientIpResolver;

    /**
     * 一台已登录的设备。
     *
     * @param sessionId 会话标识，用来远程登出；不下发给页面以外的任何地方
     * @param current   是不是当前正在用的这一台
     */
    public record LoginDevice(String sessionId, String deviceName, String ip,
                              OffsetDateTime loggedInAt, OffsetDateTime lastActiveAt, boolean current) {}

    /** 登录成功时记下这台设备。 */
    public void remember(HttpSession session, HttpServletRequest request) {
        session.setAttribute(DEVICE_ATTRIBUTE, Map.of(
                "deviceName", describe(request.getHeader("User-Agent")),
                "ip", clientIpResolver.resolve(request),
                "loggedInAt", OffsetDateTime.now(ZoneOffset.UTC).toString()));
    }

    /** 某个账号当前所有的登录设备，最近活跃的排在前面。 */
    public List<LoginDevice> devicesOf(String username, String currentSessionId) {
        return sessions.findByPrincipalName(username).values().stream()
                .map(session -> toDevice(session, currentSessionId))
                .sorted(Comparator.comparing(LoginDevice::lastActiveAt).reversed())
                .toList();
    }

    /**
     * 踢掉一台设备。
     *
     * <p>只允许删自己名下的会话：否则拿到任意一个会话 id 就能把别人踢下线。</p>
     *
     * @return 是否真的删掉了
     */
    public boolean revoke(String username, String sessionId) {
        Session target = sessions.findById(sessionId);
        if (target == null) return false;
        String owner = target.getAttribute(FindByIndexNameSessionRepository.PRINCIPAL_NAME_INDEX_NAME);
        if (!username.equals(owner)) return false;
        sessions.deleteById(sessionId);
        return true;
    }

    /**
     * 踢掉这个账号除当前会话以外的全部设备。
     *
     * <p>改密码之后会走这里：改密码通常就是因为怀疑号被别人用了，留着旧会话等于没改。</p>
     *
     * @return 踢掉的设备数
     */
    public int revokeOthers(String username, String currentSessionId) {
        int removed = 0;
        for (String id : sessions.findByPrincipalName(username).keySet()) {
            if (id.equals(currentSessionId)) continue;
            sessions.deleteById(id);
            removed++;
        }
        return removed;
    }

    private LoginDevice toDevice(Session session, String currentSessionId) {
        Map<String, String> device = session.getAttribute(DEVICE_ATTRIBUTE);
        String loggedInAt = device == null ? null : device.get("loggedInAt");
        return new LoginDevice(
                session.getId(),
                device == null ? "未知设备" : device.getOrDefault("deviceName", "未知设备"),
                device == null ? null : device.get("ip"),
                loggedInAt == null ? at(session.getCreationTime()) : OffsetDateTime.parse(loggedInAt),
                at(session.getLastAccessedTime()),
                session.getId().equals(currentSessionId));
    }

    private static OffsetDateTime at(Instant instant) {
        return instant == null ? null : instant.atOffset(ZoneOffset.UTC);
    }

    /**
     * 从 User-Agent 里认出设备。
     *
     * <p>刻意只做粗粒度识别，不引入 UA 解析库：这里要回答的是「哪一台是我现在拿着的手机」，
     * 「iPhone · Safari」已经足够，精确到型号和版本号反而看不过来。</p>
     */
    static String describe(String userAgent) {
        if (userAgent == null || userAgent.isBlank()) return "未知设备";
        String platform = userAgent.contains("iPhone") ? "iPhone"
                : userAgent.contains("iPad") ? "iPad"
                : userAgent.contains("Android") ? "Android"
                : userAgent.contains("Macintosh") || userAgent.contains("Mac OS") ? "Mac"
                : userAgent.contains("Windows") ? "Windows"
                : userAgent.contains("Linux") ? "Linux"
                : "其他设备";
        // 顺序有讲究：Edge 的 UA 里同时有 Chrome 和 Safari，Chrome 的 UA 里也有 Safari
        String browser = userAgent.contains("Edg/") ? "Edge"
                : userAgent.contains("OPR/") ? "Opera"
                : userAgent.contains("Firefox/") ? "Firefox"
                : userAgent.contains("Chrome/") ? "Chrome"
                : userAgent.contains("Safari/") ? "Safari"
                : null;
        return browser == null ? platform : platform + " · " + browser;
    }

}
