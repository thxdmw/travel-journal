package com.thx.traveljournal.common.api;

import com.thx.traveljournal.common.exception.BusinessException;

/**
 * 分页参数的统一边界。
 *
 * <p>以前各处只写 {@code Math.min(pageSize, 100)}，只管住了上界：{@code pageSize=0} 会被
 * MyBatis-Plus 当成「不分页」直接把整表拉回来，负数则要么翻成巨大的 offset，要么直接抛
 * 数据库异常变成 500。非法参数应该是一个明明白白的 400，而不是一次全表扫描。</p>
 */
public final class Pagination {
    /** 单页上限。个人站点没有一次要一百条以上的场景，放开只会让首屏和数据库一起变慢。 */
    public static final long MAX_PAGE_SIZE = 100;
    /** 关键词长度上限，避免超长串进入 LIKE。 */
    public static final int MAX_KEYWORD_LENGTH = 100;

    private Pagination() {}

    /** 校验页码和每页条数，越界抛 400。 */
    public static void check(long page, long pageSize) {
        if (page < 1) throw BusinessException.badRequest("页码必须从 1 开始");
        if (pageSize < 1) throw BusinessException.badRequest("每页条数必须大于 0");
        if (pageSize > MAX_PAGE_SIZE)
            throw BusinessException.badRequest("每页最多 " + MAX_PAGE_SIZE + " 条");
    }

    /** 校验模糊查询关键词的长度。null 和空串表示不过滤，一律放行。 */
    public static void checkKeyword(String keyword) {
        if (keyword != null && keyword.length() > MAX_KEYWORD_LENGTH)
            throw BusinessException.badRequest("搜索关键词最多 " + MAX_KEYWORD_LENGTH + " 个字符");
    }
}
