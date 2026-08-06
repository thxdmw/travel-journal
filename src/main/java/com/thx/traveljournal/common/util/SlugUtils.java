package com.thx.traveljournal.common.util;

import com.thx.traveljournal.common.exception.BusinessException;

import java.util.Locale;
import java.util.regex.Pattern;

/** Slug 归一化工具：前台网址里用到的短链，只允许小写字母、数字和短横线。 */
public final class SlugUtils {
    private static final Pattern VALID = Pattern.compile("^[a-z0-9]+(?:-[a-z0-9]+)*$");
    private SlugUtils() {}

    public static String normalize(String value) {
        if (value == null) throw BusinessException.badRequest("Slug 不能为空");
        String slug = value.trim().toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("(^-+|-+$)", "");
        if (!VALID.matcher(slug).matches()) throw BusinessException.badRequest("Slug 只能包含小写字母、数字和短横线");
        return slug;
    }
}
