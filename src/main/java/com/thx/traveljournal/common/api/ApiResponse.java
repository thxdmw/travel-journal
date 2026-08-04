package com.thx.traveljournal.common.api;

public record ApiResponse<T>(String code, String message, T data, String requestId) {
    public static <T> ApiResponse<T> ok(T data) {
        return new ApiResponse<>("OK", "success", data, RequestIds.current());
    }
    public static ApiResponse<Void> ok() { return ok(null); }
    public static <T> ApiResponse<T> error(String code, String message, T data) {
        return new ApiResponse<>(code, message, data, RequestIds.current());
    }
}
