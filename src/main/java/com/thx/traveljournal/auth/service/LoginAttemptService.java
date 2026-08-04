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

@Service
public class LoginAttemptService {
    private static final int LIMIT = 10;
    private static final Duration WINDOW = Duration.ofMinutes(5);
    private final Map<String, Deque<Instant>> failures = new ConcurrentHashMap<>();

    public void check(String ip) {
        Deque<Instant> attempts = failures.computeIfAbsent(ip, key -> new ArrayDeque<>());
        synchronized (attempts) {
            purge(attempts);
            if (attempts.size() >= LIMIT) {
                throw new BusinessException("TOO_MANY_ATTEMPTS", "登录失败次数过多，请稍后再试", HttpStatus.TOO_MANY_REQUESTS);
            }
        }
    }

    public void failed(String ip) {
        Deque<Instant> attempts = failures.computeIfAbsent(ip, key -> new ArrayDeque<>());
        synchronized (attempts) {
            purge(attempts);
            attempts.addLast(Instant.now());
        }
    }

    public void success(String ip) {
        failures.remove(ip);
    }

    private void purge(Deque<Instant> attempts) {
        Instant threshold = Instant.now().minus(WINDOW);
        while (!attempts.isEmpty() && attempts.peekFirst().isBefore(threshold)) attempts.removeFirst();
    }
}
