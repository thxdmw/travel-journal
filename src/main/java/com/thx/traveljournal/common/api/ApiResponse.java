package com.thx.traveljournal.common.api;

/**
 * 所有接口的统一响应外壳。
 *
 * <p>前端的 axios 拦截器会自动剥掉这层，只把 {@code data} 交给业务代码。</p>
 *
 * @param code      业务状态码，成功固定为 OK，失败见各异常定义
 * @param message   给人看的提示语，前端会直接弹出来
 * @param data      实际数据
 * @param requestId 本次请求的追踪 id，排查线上问题时和日志对照使用
 */
public record ApiResponse<T>(String code, String message, T data, String requestId) {
    public static <T> ApiResponse<T> ok(T data) {
        return new ApiResponse<>("OK", "success", data, RequestIds.current());
    }
    public static ApiResponse<Void> ok() { return ok(null); }
    public static <T> ApiResponse<T> error(String code, String message, T data) {
        return new ApiResponse<>(code, message, data, RequestIds.current());
    }
}
