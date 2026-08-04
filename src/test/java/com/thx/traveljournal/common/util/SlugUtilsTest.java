package com.thx.traveljournal.common.util;

import com.thx.traveljournal.common.exception.BusinessException;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.*;

class SlugUtilsTest {
    @Test
    void shouldNormalizeSlug() {
        assertThat(SlugUtils.normalize("  Japan 2026 Spring ")).isEqualTo("japan-2026-spring");
    }

    @Test
    void shouldRejectEmptySlug() {
        assertThatThrownBy(() -> SlugUtils.normalize("中文"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Slug");
    }
}
