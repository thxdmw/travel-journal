package com.thx.traveljournal.common.util;

import com.thx.traveljournal.common.exception.BusinessException;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.concurrent.ThreadLocalRandom;
import java.util.regex.Pattern;

/** Slug 归一化工具：前台网址里用到的短链，只允许小写字母、数字和短横线。 */
public final class SlugUtils {
    private static final Pattern VALID = Pattern.compile("^[a-z0-9]+(?:-[a-z0-9]+)*$");
    /** 36^5，用来保证随机后缀恒为 6 位 base36，不会因为高位是 0 而缩短 */
    private static final long SUFFIX_FLOOR = 60466176L;
    private SlugUtils() {}

    public static String normalize(String value) {
        if (value == null) throw BusinessException.badRequest("Slug 不能为空");
        String slug = value.trim().toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("(^-+|-+$)", "");
        if (!VALID.matcher(slug).matches()) throw BusinessException.badRequest("Slug 只能包含小写字母、数字和短横线");
        return slug;
    }

    /**
     * 给草稿生成一个 slug，形如 {@code journal-20260810-k3f9a2}。
     *
     * <p>旅行途中写日记不该先想网址长什么样，所以草稿的 slug 由系统给。
     * 随机后缀是为了让同一天的多篇日记不会撞上 {@code journal_entry.slug} 的唯一约束，
     * 作者仍然可以在发布前改成自己想要的。</p>
     *
     * @param date 日记发生日期，为空时用今天
     */
    public static String autoSlug(LocalDate date) {
        LocalDate day = date == null ? LocalDate.now() : date;
        long suffix = ThreadLocalRandom.current().nextLong(SUFFIX_FLOOR, SUFFIX_FLOOR * 36);
        return "journal-" + day.format(DateTimeFormatter.BASIC_ISO_DATE)
                + "-" + Long.toString(suffix, 36);
    }
}
