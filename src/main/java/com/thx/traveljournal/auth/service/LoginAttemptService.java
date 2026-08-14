package com.thx.traveljournal.auth.service;

import com.thx.traveljournal.common.exception.BusinessException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 登录失败次数限制：同一 IP 在 5 分钟内失败 10 次后暂时拒绝登录。
 *
 * <p>计数放在内存里，重启即清零。单实例部署够用；如果日后要多实例，这里得换成 Redis。</p>
 */
@Service
public class LoginAttemptService {
    private static final int LIMIT = 10;
    private static final Duration WINDOW = Duration.ofMinutes(5);
    /**
     * 同时跟踪的 IP 上限。
     *
     * <p>这张表以 IP 为键，只增不减的话，一轮换着源地址的扫描就能让它无限长大——
     * 那不再是限流，而是一条把自己撑爆的路径。超过上限时先清一遍过期的，还是满就
     * 拒绝新增：这时限流本身已经失去意义，保住进程比记住第 10001 个 IP 重要。</p>
     */
    private static final int MAX_TRACKED_IPS = 10_000;

    private final Map<String, Deque<Instant>> failures = new ConcurrentHashMap<>();

    /** 登录前调用，超过阈值直接抛异常拦下。 */
    public void check(String ip) {
        Deque<Instant> attempts = failures.get(ip);
        if (attempts == null) return;
        synchronized (attempts) {
            purge(attempts);
            if (attempts.isEmpty()) {
                failures.remove(ip, attempts);
                return;
            }
            if (attempts.size() >= LIMIT) {
                throw new BusinessException("TOO_MANY_ATTEMPTS", "登录失败次数过多，请稍后再试", HttpStatus.TOO_MANY_REQUESTS);
            }
        }
    }

    /** 记一次失败。 */
    public void failed(String ip) {
        Deque<Instant> attempts = failures.get(ip);
        if (attempts == null) {
            if (failures.size() >= MAX_TRACKED_IPS) {
                evictExpired();
                if (failures.size() >= MAX_TRACKED_IPS) return;
            }
            attempts = failures.computeIfAbsent(ip, key -> new ArrayDeque<>());
        }
        synchronized (attempts) {
            purge(attempts);
            attempts.addLast(Instant.now());
        }
    }

    /** 回收窗口内已经没有任何失败记录的 IP。 */
    private void evictExpired() {
        failures.entrySet().removeIf(entry -> {
            Deque<Instant> attempts = entry.getValue();
            synchronized (attempts) {
                purge(attempts);
                return attempts.isEmpty();
            }
        });
    }

    /** 当前正在跟踪的 IP 数，供测试和监控查看。 */
    public int trackedIpCount() {
        return failures.size();
    }

    /** 登录成功后清空该 IP 的失败记录。 */
    public void success(String ip) {
        failures.remove(ip);
    }

    /** 丢弃时间窗口之外的旧记录。 */
    private void purge(Deque<Instant> attempts) {
        Instant threshold = Instant.now().minus(WINDOW);
        while (!attempts.isEmpty() && attempts.peekFirst().isBefore(threshold)) attempts.removeFirst();
    }
}
