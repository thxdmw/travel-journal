package com.thx.traveljournal.auth.service;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.session.Session;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

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
    /**
     * 设备标识 Cookie。
     *
     * <p>会话 cookie 关掉浏览器、应用重启、清一次站点数据就没了，再登录就是一个全新会话，
     * 而上一条会话记录还躺在库里没到期——于是同一台手机在「登录设备」里出现两次、三次，
     * 分不清哪个是现在这台。这个 cookie 活得比会话长，专门用来回答「你还是刚才那台吗」。</p>
     *
     * <p>它不是凭据：泄露了也登不进任何账号，只是一个随机串。</p>
     */
    static final String DEVICE_COOKIE = "tj-device";
    /** 设备标识的存活时间，400 天是浏览器允许的上限附近，够覆盖「一年没登录」。 */
    private static final int DEVICE_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

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

    /**
     * 登录成功时记下这台设备，并让同一台设备上的旧会话立刻作废。
     *
     * <p>「在手机上登录了两次，列表里却有两条记录」就是这里要解决的：第二次登录会拿到
     * 一个新会话，旧那条不会自己消失，要等 max-inactive 过期。对作者来说这两条长得
     * 一模一样，既看不出哪条是现在这台，也不敢随便踢。所以认出是同一台设备之后，
     * 直接把它名下的旧会话删掉——那些会话反正已经没有任何浏览器还拿着它的 cookie。</p>
     *
     * @return 顺带清掉的旧会话数
     */
    public int remember(String username, HttpSession session,
                        HttpServletRequest request, HttpServletResponse response) {
        String deviceId = resolveDeviceId(request, response);
        /*
         * 值用 HashMap 而不是 Map.of：ip 可能解析不出来，而 Map.of 遇到 null 直接抛 NPE，
         * 那会让整个登录失败——为了记一条设备名把人挡在门外，代价完全不对等。
         */
        Map<String, String> device = new HashMap<>();
        device.put("deviceName", describe(request.getHeader("User-Agent")));
        device.put("ip", clientIpResolver.resolve(request));
        device.put("deviceId", deviceId);
        device.put("loggedInAt", OffsetDateTime.now(ZoneOffset.UTC).toString());
        session.setAttribute(DEVICE_ATTRIBUTE, device);
        return revokeSameDevice(username, deviceId, session.getId());
    }

    /**
     * 取这台设备的标识，没有就现发一个并种进 cookie。
     *
     * <p>cookie 在响应里种，所以第一次登录时列表里仍然只有一条；从第二次开始，
     * 同一台设备的重复登录就会覆盖掉上一条而不是并排堆着。</p>
     */
    private String resolveDeviceId(HttpServletRequest request, HttpServletResponse response) {
        Cookie[] cookies = request.getCookies();
        if (cookies != null) {
            for (Cookie cookie : cookies) {
                if (DEVICE_COOKIE.equals(cookie.getName()) && isDeviceId(cookie.getValue())) {
                    return cookie.getValue();
                }
            }
        }
        String issued = UUID.randomUUID().toString();
        Cookie cookie = new Cookie(DEVICE_COOKIE, issued);
        cookie.setPath("/");
        // 前端一行 JS 都用不上它，关掉脚本访问纯属白拿的加固
        cookie.setHttpOnly(true);
        cookie.setSecure(request.isSecure());
        cookie.setMaxAge(DEVICE_COOKIE_MAX_AGE_SECONDS);
        cookie.setAttribute("SameSite", "Lax");
        response.addCookie(cookie);
        return issued;
    }

    /** 只认自己发出去的那种格式，免得被伪造的 cookie 值污染会话属性。 */
    private boolean isDeviceId(String value) {
        if (value == null) return false;
        try {
            UUID.fromString(value);
            return true;
        } catch (IllegalArgumentException ignored) {
            return false;
        }
    }

    /** 删掉这个账号在同一台设备上留下的其他会话。 */
    private int revokeSameDevice(String username, String deviceId, String currentSessionId) {
        int removed = 0;
        for (Session session : sessions.findByPrincipalName(username).values()) {
            if (session.getId().equals(currentSessionId)) continue;
            Map<String, String> device = session.getAttribute(DEVICE_ATTRIBUTE);
            if (device == null || !deviceId.equals(device.get("deviceId"))) continue;
            sessions.deleteById(session.getId());
            removed++;
        }
        return removed;
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
