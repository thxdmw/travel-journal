package com.thx.traveljournal.common.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;

/**
 * 业务异常，携带业务码和 HTTP 状态码，由 {@link GlobalExceptionHandler} 统一转成响应体。
 *
 * <p>message 会原样展示给用户，所以要写成中文的、能指导用户下一步怎么做的话。</p>
 */
@Getter
public class BusinessException extends RuntimeException {
    private final String code;
    private final HttpStatus status;
    public BusinessException(String code, String message, HttpStatus status) {
        super(message); this.code = code; this.status = status;
    }
    public static BusinessException notFound(String message) {
        return new BusinessException("NOT_FOUND", message, HttpStatus.NOT_FOUND);
    }
    public static BusinessException badRequest(String message) {
        return new BusinessException("BAD_REQUEST", message, HttpStatus.BAD_REQUEST);
    }
    public static BusinessException conflict(String message) {
        return new BusinessException("CONFLICT", message, HttpStatus.CONFLICT);
    }
}
