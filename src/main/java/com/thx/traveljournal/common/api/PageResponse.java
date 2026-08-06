package com.thx.traveljournal.common.api;

import java.util.List;

/**
 * 分页结果。
 *
 * @param totalPages 总页数，由 {@link #of} 依据总数和每页条数算出，避免前端各算各的
 */
public record PageResponse<T>(List<T> items, long page, long pageSize, long total, long totalPages) {
    public static <T> PageResponse<T> of(List<T> items, long page, long pageSize, long total) {
        return new PageResponse<>(items, page, pageSize, total, pageSize == 0 ? 0 : (total + pageSize - 1) / pageSize);
    }
}
